import os
import io
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# Suppress thought_signature warnings from google-genai SDK
logging.getLogger("google_genai").setLevel(logging.ERROR)

app = FastAPI(
    title="LabPrint AI pH Analyze Backend",
    description="Python FastAPI backend for image analysis using the official Google GenAI SDK",
    version="0.3.0",
)

# CORS middleware configuration
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
    gemini_configured: bool


# Schema used strictly by the Gemini API for structured extraction
class GeminiLabelExtraction(BaseModel):
    sample_id: str = Field(
        description="The sample ID code written in the blue box, e.g., '3878/16'"
    )
    measurement_run: int = Field(
        description="The run number, must be either 1 or 2"
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0 based on how clear the text is"
    )


# Final schema returned by the FastAPI server to the Next.js frontend
class SampleLabelAnalysis(BaseModel):
    sample_id: str
    measurement_run: int
    confidence: float
    enhanced_image: str = Field(
        description="Base64 data URL of the enhanced (brighter, higher contrast) image"
    )


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint to verify backend service status and API configuration.
    """
    api_key_set = bool(os.getenv("GEMINI_API_KEY"))
    logger.info(f"Health check endpoint hit. Gemini API key configured: {api_key_set}")
    return HealthResponse(
        status="online",
        service="LabPrint Backend",
        gemini_configured=api_key_set
    )


@app.post("/api/analyze-image", response_model=SampleLabelAnalysis)
async def analyze_image(
    file: UploadFile = File(...),
    lang: str = Query("en", description="Localization language query parameter ('en' or 'vi')")
):
    """
    Endpoint to receive a lab pH image and process it via the Gemini model
    with strict Structured Outputs using the official google-genai SDK.
    Supports English and Vietnamese instruction localized prompts.
    """
    logger.info(f"Received file for analysis: {file.filename}, type: {file.content_type}, lang: {lang}")

    # Localized file type validation error
    if not file.content_type or not file.content_type.startswith("image/"):
        if lang == "vi":
            err_msg = f"Tệp '{file.filename}' không phải là hình ảnh hợp lệ. Định dạng nhận được: {file.content_type}"
        else:
            err_msg = f"File '{file.filename}' is not a valid image. Received type: {file.content_type}"
        
        logger.warning(err_msg)
        raise HTTPException(status_code=400, detail=err_msg)

    # Localized API Key validation error
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        if lang == "vi":
            err_msg = "Thiếu khóa Gemini API. Vui lòng thiết lập biến GEMINI_API_KEY trong tệp /backend/.env"
        else:
            err_msg = "Gemini API Key is missing. Please set the GEMINI_API_KEY variable in /backend/.env"
        
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)

    try:
        from google import genai
        from google.genai import types
        
        # Read the file contents and convert into a PIL Image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Loaded image successfully: {image.format} - {image.size}")

        # Initialize the Gemini client
        client = genai.Client()
        
        # Dynamically switch instructions prompt based on active language parameter
        if lang == "vi":
            prompt_instructions = (
                "Bạn là một trợ lý phòng thí nghiệm chuyên nghiệp. Hãy phân tích hình ảnh cốc đo pH này. "
                "Xác định nhãn viết tay nằm bên trong khung viền màu xanh. Trích xuất:\n"
                "1. Mã số mẫu (thường viết ở dòng đầu tiên của nhãn dán màu xanh, ví dụ '3878/16' hoặc '3884/26').\n"
                "2. Lần đo (thường được viết ở dòng thứ hai hoặc kế bên, có giá trị là số 1 hoặc 2).\n"
                "Trả về kết quả có cấu trúc khớp chính xác với định dạng JSON được yêu cầu."
            )
        else:
            prompt_instructions = (
                "You are a professional laboratory assistant. Analyze this image of a pH measurement cup. "
                "Locate the handwritten label inside the blue bounding box. Extract:\n"
                "1. The Sample ID (usually written on the first line inside the blue box, like '3878/16' or '3884/26').\n"
                "2. The Measurement Run number (usually written on the second line or next to the ID, strictly '1' or '2').\n"
                "Return the data structured precisely matching the JSON schema."
            )

        logger.info(f"Calling Gemini API (gemini-3.1-flash) in '{lang}'...")
        
        # Call the Gemini model with structured output configuration (using GeminiLabelExtraction)
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=[image, prompt_instructions],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiLabelExtraction,
                temperature=0.1,
            ),
        )

        parsed_result = response.parsed
        if not parsed_result:
            if lang == "vi":
                err_msg = "Mô hình Gemini không trả về dữ liệu cấu trúc."
            else:
                err_msg = "The Gemini model failed to return structured metadata."
            logger.error(err_msg)
            raise HTTPException(status_code=500, detail=err_msg)

        logger.info(f"Successfully extracted metadata from Gemini: {parsed_result}")

        # Image enhancement: make it brighter and enhance readability
        from PIL import ImageEnhance
        import base64

        # 1. Enhance brightness by 35%
        brightness_enhancer = ImageEnhance.Brightness(image)
        enhanced_image = brightness_enhancer.enhance(1.35)

        # 2. Enhance contrast by 25% (makes text/numbers on display stand out)
        contrast_enhancer = ImageEnhance.Contrast(enhanced_image)
        enhanced_image = contrast_enhancer.enhance(1.25)

        # 3. Enhance sharpness by 50% (makes text edges clearer)
        sharpness_enhancer = ImageEnhance.Sharpness(enhanced_image)
        enhanced_image = sharpness_enhancer.enhance(1.5)

        # Encode processed image to base64
        buffered = io.BytesIO()
        enhanced_image.save(buffered, format="JPEG", quality=90)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        enhanced_base64 = f"data:image/jpeg;base64,{img_str}"

        # Return final combined object to Next.js
        return SampleLabelAnalysis(
            sample_id=parsed_result.sample_id,
            measurement_run=parsed_result.measurement_run,
            confidence=parsed_result.confidence,
            enhanced_image=enhanced_base64
        )

    except Exception as e:
        if lang == "vi":
            err_msg = f"Phân tích Gemini API thất bại: {str(e)}"
        else:
            err_msg = f"Gemini API analysis failed: {str(e)}"
        
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)
