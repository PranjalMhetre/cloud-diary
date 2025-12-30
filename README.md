# Cloud Diary: #

[View the application](https://diary-upload-v2-e2ecgwc0b2g6esar.centralus-01.azurewebsites.net/api/app/)

Cloud Diary is a location based photo diary built on Azure. Users can upload photos, organize them into folders, and view memories either as albums or on an interactive map. Each photo is stored with captions, folder names, and GPS data.

## Tech Stack

### Frontend
- HTML
- CSS
- Vanilla JavaScript
- Leaflet.js
- OpenStreetMap

### Backend
- Azure Functions (Python)
- Azure Blob Storage
- Azure Cosmos DB
- Azure App Service Authentication (Azure AD)

## Architecture Overview

The application is split into two parts.

The frontend is a static web app served from an Azure Storage Account. All user interaction, uploads, searching, folder navigation, and map behavior runs in the browser.

The backend is a Python based Azure Function App that exposes HTTP endpoints for uploading, retrieving, and deleting photos. Images are stored in Blob Storage, and metadata is stored in Cosmos DB.

## Backend API Routes

| Route | Method | Purpose |
|------|--------|---------|
| `/api/app/{filename}` | GET | Serves frontend files |
| `/api/upload_image` | POST | Uploads an image and metadata |
| `/api/get_images` | GET | Retrieves all photos for the authenticated user |
| `/api/delete_image` | DELETE | Deletes a photo and its metadata |

## Data Storage

### Blob Storage
- Container name: `raw-images`
- Stores uploaded image files
- Filenames are generated using UUIDs to avoid collisions

### Cosmos DB
- Database: `DiaryDB`
- Container: `Metadata`
- Partition key: `user_id`

Each document stores:
- Image ID
- User ID
- Blob URL
- Caption
- Folder name
- Location string
- Latitude and longitude

## Key Features

### Photo Upload
- Images are uploaded through the browser
- The browser attempts to capture GPS coordinates using the Geolocation API
- Coordinates are reverse geocoded into a readable city and country string
- Image files are stored in Blob Storage
- Metadata is stored in Cosmos DB

### Folder Based Albums
- Photos can be grouped into folders
- The grid view shows folders first, then photos inside each folder
- Unassigned photos are placed in an "Unsorted" folder

### Interactive Map
- Built using Leaflet.js
- Photos with GPS data appear as map markers
- Photos at the same coordinates are grouped into a single marker
- Clicking a marker opens a popup carousel
- Clicking a photo in the popup jumps back to the album view

### Search and Filtering
- Filters photos by caption, folder name, or location text
- Updates both the grid view and map view in real time

### Deletion
- Deleting a photo removes it from Cosmos DB
- The corresponding image is deleted from Blob Storage

## Authentication and Security

Authentication is handled using Azure App Service Authentication with Azure Active Directory.

- Each request includes the authenticated user ID in the `X-MS-CLIENT-PRINCIPAL-ID` header
- The backend uses this value as the partition key in Cosmos DB
- Users can only access their own photos
