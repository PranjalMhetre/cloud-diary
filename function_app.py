import azure.functions as func
import logging
import os
import uuid
import json
from azure.storage.blob import BlobServiceClient
from azure.cosmos import CosmosClient

app = func.FunctionApp()

#upload image
@app.route(route="upload_image", auth_level=func.AuthLevel.ANONYMOUS)
def uploadImage(req):
    try:
        # security check
        userId = req.headers.get("X-MS-CLIENT-PRINCIPAL-ID")

        if not userId:
            logging.warning("Upload attempt without auth headers")
            return func.HttpResponse("Unauthorized: Missing user identity", status_code=401)

        # get the file from the request
        fileReceived = req.files.get('file')
        if not fileReceived:
            return func.HttpResponse("Bad Request: No file payload found", status_code=400)

        # connect to Azure Blob Storage
        connectStr = os.environ.get("AzureWebJobsStorage")
        blobService = BlobServiceClient.from_connection_string(connectStr)
        
        # create a unique name for the file
        extension = fileReceived.filename.split('.')[-1]
        uniqueName = str(uuid.uuid4()) + "." + extension
        
        # ensure the container exists
        containerClient = blobService.get_container_client("raw-images")
        if not containerClient.exists():
            containerClient.create_container()
            
        # put the file in blob storage
        blobClient = containerClient.get_blob_client(uniqueName)
        blobClient.upload_blob(fileReceived.stream, overwrite=True)

        # store metadata in Cosmos DB
        cosmosStr = os.environ.get("AzureCosmosDBConnectionString")
        client = CosmosClient.from_connection_string(cosmosStr)
        database = client.get_database_client("DiaryDB")
        container = database.get_container_client("Metadata")

        # get location data
        lat = req.form.get('lat')
        lon = req.form.get('lon')

        item = {
            "id": uniqueName,           # name
            "user_id": userId,          # key
            "url": blobClient.url,      # link
            "caption": req.form.get('caption'),
            "folder": req.form.get('folder'),
            "location": req.form.get('location'),
            # Convert to actual none types
            "lat": float(lat) if lat and lat != "null" else None,
            "lon": float(lon) if lon and lon != "null" else None
            
        }
        
        # upsert item into Cosmos DB
        container.upsert_item(item)
        
        logging.info(f"Successfully uploaded {uniqueName} for user {userId}")
        return func.HttpResponse(json.dumps({"status": "success", "id": uniqueName}), status_code=200)

    except Exception as e:
        logging.error(f"Upload failed: {str(e)}")
        return func.HttpResponse(f"Pipeline failure: {str(e)}", status_code=500)

# get images
@app.route(route="get_images", auth_level=func.AuthLevel.ANONYMOUS)
def getImages(req):
    try:
        userId = req.headers.get("X-MS-CLIENT-PRINCIPAL-ID")
        if not userId: 
            return func.HttpResponse("Unauthorized", status_code=401)

        cosmosStr = os.environ.get("AzureCosmosDBConnectionString")
        client = CosmosClient.from_connection_string(cosmosStr)
        database = client.get_database_client("DiaryDB")
        container = database.get_container_client("Metadata")

        # SQL query to get all items for this specific user
        items = list(container.query_items(
            query="SELECT * FROM c",
            partition_key=userId
        ))

        return func.HttpResponse(json.dumps(items), status_code=200)

    except Exception as e:
        logging.error(f"Failed to retrieve images for user {userId}: {e}")
        return func.HttpResponse("Cosmos DB query failed", status_code=500)

# delete image
@app.route(route="delete_image", auth_level=func.AuthLevel.ANONYMOUS)
def deleteImage(req):
    try:
        userId = req.headers.get("X-MS-CLIENT-PRINCIPAL-ID")
        if not userId: return func.HttpResponse("Unauthorized", status_code=401)

        imgId = req.params.get('name')
        if not imgId:
            return func.HttpResponse("Missing 'name' parameter", status_code=400)
        
        # delete metadata from Cosmos DB
        cosmosStr = os.environ.get("AzureCosmosDBConnectionString")
        client = CosmosClient.from_connection_string(cosmosStr)
        database = client.get_database_client("DiaryDB")
        container = database.get_container_client("Metadata")
        container.delete_item(item=imgId, partition_key=userId)

        # delete blob from Azure Blob Storage
        connectStr = os.environ.get("AzureWebJobsStorage")
        blobService = BlobServiceClient.from_connection_string(connectStr)
        blobClient = blobService.get_blob_client("raw-images", imgId)
        
        if blobClient.exists():
            blobClient.delete_blob()

        logging.info(f"Deleted image {imgId}")
        return func.HttpResponse(json.dumps({"status": "deleted"}), status_code=200)

    except Exception as e:
        logging.error(f"Delete operation failed: {e}")
        return func.HttpResponse("Failed to remove artifacts from storage", status_code=500)