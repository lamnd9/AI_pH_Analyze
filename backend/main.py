import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(
    title="LabPrint AI pH Analyze Backend",
    description="Python FastAPI backend for image analysis and health checks",
    version="0.1.0",
)

# CORS middleware configuration
# Frontend is running on http://localhost:3000
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str


class AnalysisResponse(BaseModel):
    sample_id: str
    measurement_run: int
    filename: str
    content_type: str
    size_bytes: int


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint to verify backend service status.
    """
    logger.info("Health check endpoint hit")
    return HealthResponse(status="online", service="LabPrint Backend")


@app.post("/api/analyze-image", response_model=AnalysisResponse)
async def analyze_image(file: UploadFile = File(...)):
    """
    Endpoint to receive and process a lab pH image.
    Performs mock validation and analysis.
    """
    logger.info(f"Received file: {file.filename}, type: {file.content_type}")

    # Validate that the file is an image
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"File '{file.filename}' is not a valid image. Received type: {file.content_type}"
        )

    try:
        # Read file contents to simulate processing
        contents = await file.read()
        file_size = len(contents)
        
        # Here we could load the image with PIL if actual image processing is needed:
        # from PIL import Image
        # import io
        # image = Image.open(io.BytesIO(contents))
        # logger.info(f"Image details - Format: {image.format}, Size: {image.size}")
        
        logger.info(f"Processed file {file.filename} of size {file_size} bytes successfully")
        
        # Return mock JSON response as requested
        return AnalysisResponse(
            sample_id="3878/16",
            measurement_run=1,
            filename=file.filename,
            content_type=file.content_type,
            size_bytes=file_size,
        )

    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing the image: {str(e)}"
        )
