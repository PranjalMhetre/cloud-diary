const API_URL = "https://diary-upload-v2-e2ecgwc0b2g6esar.centralus-01.azurewebsites.net/api/app";
let allPhotos = [];
let mapInstance = null;
let markerLayer = null;
// If 5 photos are at the exact same GPS spot, group them in photoClusters
let photoClusters = {};
let clusterIndex = {};

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initUI();
});

function initUI() {
    // Button Event Listeners
    document.getElementById('btnGrid').addEventListener('click', () => setView('grid'));
    document.getElementById('btnMap').addEventListener('click', () => setView('map'));
    document.getElementById('backBtn').addEventListener('click', () => resetInterface());
    document.getElementById('appTitle').addEventListener('click', () => resetInterface());

    // Upload & Search Listeners
    document.getElementById('fileInput').addEventListener('change', updateFilenameLabel);
    document.getElementById('btnUpload').addEventListener('click', uploadFile);
    // filtering as you type
    document.getElementById('searchInput').addEventListener('keyup', filterData);
}

// authentication & user session
function initAuth() {
    const returnUrl = window.location.origin + window.location.pathname;

    document.getElementById('loginLink').href = `${API_URL}/.auth/login/aad?post_login_redirect_url=${encodeURIComponent(returnUrl)}`;
    document.getElementById('logoutLink').href = `${API_URL}/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(returnUrl)}`;

    // Check if user is logged in
    fetch(`${API_URL}/.auth/me?v=${Date.now()}`)
        .then(response => response.json())
        .then(userData => {
            if (userData.length > 0) {
                // User is logged in
                document.getElementById('userInfo').innerText = userData[0].user_id;
                document.getElementById('loginLink').style.display = 'none';
                document.getElementById('logoutLink').style.display = 'inline';
                loadData(); // Start fetching photos
            } else {
                // User is notlogged in
                document.getElementById('appGrid').innerHTML = "<p style='text-align:center; width:100%; margin-top: 50px;'>Please log in to view your memories.</p>";
            }
        })
        .catch(() => {
            // local testing mode
            document.getElementById('userInfo').innerText = "Dev User";
            loadData();
        });
}

// load data from backend
async function loadData() {
    try {
        let response = await fetch(`${API_URL}/api/get_images`);
        if (response.ok) {
            allPhotos = await response.json();
            renderFolders(); // folder view on load
        }
    } catch (err) {
        console.error("Data load failed", err);
    }
}

// view toggle logic
function setView(mode) {
    const grid = document.getElementById('appGrid');
    const map = document.getElementById('mapContainer');
    const upload = document.getElementById('uploadZone');

    if (mode === 'grid') {
        grid.style.display = 'grid';
        map.style.display = 'none';
        upload.style.display = 'flex'; // show upload box in grid view
        document.getElementById('btnGrid').classList.add('active');
        document.getElementById('btnMap').classList.remove('active');
    } else {
        grid.style.display = 'none';
        map.style.display = 'block';
        upload.style.display = 'none'; // hide upload box in map view
        document.getElementById('btnGrid').classList.remove('active');
        document.getElementById('btnMap').classList.add('active');
        initMap();
        filterData(); // ensure map pins match current search
    }
}

function resetInterface() {
    document.getElementById('searchInput').value = '';
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('pageTitle').innerText = "All Albums";
    setView('grid');
    renderFolders();
}

// maps and pin logic
function initMap() {
    if (mapInstance) {
        mapInstance.invalidateSize();
        return;
    }

    // create the map centered on US default
    mapInstance = L.map('mapContainer').setView([39.8, -98.5], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mapInstance);

    markerLayer = L.layerGroup().addTo(mapInstance);

    // next/prev buttons
    mapInstance.on('popupopen', (e) => {
        const popupNode = e.popup._contentNode;
        const prev = popupNode.querySelector('.prev-btn');
        const next = popupNode.querySelector('.next-btn');
        const img = popupNode.querySelector('.popup-img');

        // to know which cluster of photos we are rotating through
        if (prev) prev.onclick = () => rotateCarousel(prev.dataset.key, -1);
        if (next) next.onclick = () => rotateCarousel(next.dataset.key, 1);
        //jump to the folder view
        if (img) img.onclick = () => jumpToImage(img.dataset.folder, img.dataset.id);
    });
}

async function renderPins(photoList) {
    if (!mapInstance || !markerLayer) return;

    markerLayer.clearLayers(); // remove old pins
    photoClusters = {};

    // group photos by exact location
    photoList.forEach(photo => {
        if (photo.lat && photo.lon) {
            let key = `${photo.lat},${photo.lon}`;
            if (!photoClusters[key]) photoClusters[key] = [];
            photoClusters[key].push(photo);
        }
    });

    // create one pin per unique location key
    for (let key in photoClusters) {
        const [lat, lon] = key.split(',');
        createMarker(parseFloat(lat), parseFloat(lon), key);
    }
}

function createMarker(lat, lon, key) {
    // custom red circle icon using HTML/CSS
    const customIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="
            background-color: #e74c3c;
            width: 15px;
            height: 15px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });

    const marker = L.marker([lat, lon], { icon: customIcon }).addTo(markerLayer);
    clusterIndex[key] = 0; // start at the first image in the cluster
    marker.bindPopup(generatePopupContent(key));
}

// HTML for the popup bubble
function generatePopupContent(key) {
    const images = photoClusters[key];
    let index = clusterIndex[key];

    if (index < 0) index = images.length - 1;
    if (index >= images.length) index = 0;
    clusterIndex[key] = index;

    const currentImg = images[index];
    const safeFolder = currentImg.folder || "Unsorted";

    return `
        <div style="text-align:center; width: 200px;">
            <b>${currentImg.location || "Memory"}</b>
            <div class="popup-controls" style="margin:5px 0; display:flex; justify-content:space-between;">
                <button class="prev-btn" data-key="${key}">❮</button>
                <span class="counter-span" style="font-size:0.9em;">${index + 1} / ${images.length}</span>
                <button class="next-btn" data-key="${key}">❯</button>
            </div>
            <img src="${currentImg.url}" class="popup-img" 
                 data-folder="${safeFolder}" 
                 data-id="${currentImg.id}"
                 title="Click to view in album"
                 style="cursor:pointer; width:100%; height:120px; object-fit:cover; border-radius:4px;">
            <br>
            <small class="caption-small" style="display:block; margin-top:5px;">${currentImg.caption || ""}</small>
        </div>
    `;
}

// clicking Next/Prev in the popup
function rotateCarousel(key, direction) {
    if (!photoClusters[key]) return;

    let images = photoClusters[key];
    clusterIndex[key] += direction;

    // loop around if we go past the end or beginning
    if (clusterIndex[key] < 0) clusterIndex[key] = images.length - 1;
    if (clusterIndex[key] >= images.length) clusterIndex[key] = 0;

    let currentImg = images[clusterIndex[key]];
    const safeFolder = currentImg.folder || "Unsorted";

    const popupNode = document.querySelector('.leaflet-popup-content');
    if (popupNode) {
        const img = popupNode.querySelector('.popup-img');
        img.src = currentImg.url;
        img.dataset.id = currentImg.id;
        img.dataset.folder = safeFolder;
        popupNode.querySelector('.counter-span').innerText = `${clusterIndex[key] + 1} / ${images.length}`;
        popupNode.querySelector('.caption-small').innerText = currentImg.caption || "";
    }
}

// jumps to Grid View and highlights the card
function jumpToImage(folderName, imageId) {
    setView('grid');
    openFolder(folderName, imageId);
}

// grid and folder rendering
function renderFolders() {
    const gridElement = document.getElementById('appGrid');
    gridElement.innerHTML = "";

    // calculate how many photos are in each folder
    const folderCounts = {};
    allPhotos.forEach(p => {
        const name = p.folder || "Unsorted";
        folderCounts[name] = (folderCounts[name] || 0) + 1;
    });

    // create cards for each folder
    for (let name in folderCounts) {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.innerHTML = `<h3>📂 ${name}</h3><p>${folderCounts[name]} items</p>`;
        card.onclick = () => openFolder(name);
        gridElement.appendChild(card);
    }
}

function openFolder(name, highlightId = null) {
    document.getElementById('backBtn').style.display = 'inline-block';
    document.getElementById('pageTitle').innerText = "📂 " + name;

    const folderContents = allPhotos.filter(p => (p.folder || "Unsorted") === name);
    renderPhotos(folderContents, highlightId);
}

function renderPhotos(list, highlightId = null) {
    const gridElement = document.getElementById('appGrid');
    gridElement.innerHTML = "";

    list.forEach(photo => {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.id = `img-${photo.id}`;

        const locDisplay = (photo.location && photo.location !== "Unknown Location")
            ? `📍 ${photo.location}`
            : "";

        card.innerHTML = `
            <button class="delete-btn" title="Delete Photo">🗑️</button>
            <a href="${photo.url}" target="_blank"><img src="${photo.url}"></a>
            <div class="card-details">
                <p>${photo.caption || ""}</p>
                <small class="location-text">${locDisplay}</small>
            </div>
        `;

        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFile(photo.id);
        });

        gridElement.appendChild(card);

        // map to scroll to this specific photo 
        if (highlightId && photo.id === highlightId) {
            setTimeout(() => {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                card.classList.add("highlight-card");
                setTimeout(() => card.classList.remove("highlight-card"), 2000);
            }, 300);
        }
    });
}

// search and filtering
function filterData() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const mapContainer = document.getElementById('mapContainer');

    // find matches
    const matches = allPhotos.filter(p =>
        (p.caption || "").toLowerCase().includes(query) ||
        (p.folder || "").toLowerCase().includes(query) ||
        (p.location || "").toLowerCase().includes(query)
    );

    // update display
    if (query === "") {
        renderFolders();
    } else {
        renderPhotos(matches);
    }

    // update map pins
    const mapMatches = matches.filter(p => p.lat != null && p.lon != null);
    renderPins(mapMatches);

    // zoom map to fit pins
    if (mapContainer.style.display !== 'none' && mapInstance && mapMatches.length > 0) {
        const bounds = mapMatches.map(p => [p.lat, p.lon]);
        mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
}

// upload logic
function updateFilenameLabel() {
    const input = document.getElementById('fileInput');
    const label = document.getElementById('fileNameDisplay');
    if (input.files.length > 0) {
        label.innerText = input.files[0].name;
    } else {
        label.innerText = "";
    }
}

async function uploadFile() {
    const fileObj = document.getElementById('fileInput').files[0];
    if (!fileObj) return alert("Please select a file.");

    const statusDiv = document.getElementById('status');
    statusDiv.innerText = "Getting location...";

    let locString = "Unknown Location";
    let lat = null, lon = null;

    try {
        // wait for GPS before proceeding to upload
        const position = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Timeout")), 5000);
            navigator.geolocation.getCurrentPosition(
                (pos) => { clearTimeout(timer); resolve(pos); },
                (err) => { clearTimeout(timer); reject(err); }
            );
        });

        lat = position.coords.latitude;
        lon = position.coords.longitude;

        // Lat/Lon into City, Country
        try {
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const geoData = await geoRes.json();

            let parts = [];
            if (geoData.city) parts.push(geoData.city);
            if (geoData.principalSubdivision) parts.push(geoData.principalSubdivision);
            if (geoData.countryCode) parts.push(geoData.countryCode);

            if (parts.length > 0) locString = parts.join(", ");
            else locString = `GPS: ${lat.toFixed(2)}, ${lon.toFixed(2)}`;

        } catch (e) {
            locString = `GPS: ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        }

    } catch (e) {
        console.log("GPS not available:", e);
        locString = "Manual Upload";
    }

    statusDiv.innerText = "Uploading...";

    const formData = new FormData();
    formData.append('file', fileObj);
    formData.append('location', locString);
    if (lat) formData.append('lat', lat);
    if (lon) formData.append('lon', lon);

    formData.append('caption', document.getElementById('captionInput').value);
    formData.append('folder', document.getElementById('folderInput').value);

    try {
        const res = await fetch(`${API_URL}/api/upload_image`, { method: 'POST', body: formData });
        if (res.ok) {
            statusDiv.innerText = "Upload Complete!";

            // clear inputs
            document.getElementById('fileInput').value = "";
            document.getElementById('fileNameDisplay').innerText = "";
            document.getElementById('captionInput').value = "";

            loadData(); // refresh grid
            setTimeout(() => statusDiv.innerText = "", 3000);
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        statusDiv.innerText = "Error: " + err.message;
    }
}

async function deleteFile(id) {
    if (confirm("Are you sure you want to delete this memory?")) {
        await fetch(`${API_URL}/api/delete_image?name=${id}`);
        loadData();
    }
}