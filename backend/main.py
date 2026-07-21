import os
import io
import logging
import warnings
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image, ImageEnhance
import base64
from dotenv import load_dotenv

from services import analyze_with_gemini, analyze_with_ocr_space, GeminiLabelExtraction

# Suppress warnings related to Python 3.9 EOL and urllib3 LibreSSL
warnings.filterwarnings("ignore", category=FutureWarning, module="google.auth")
warnings.filterwarnings("ignore", category=FutureWarning, module="google.oauth2")
warnings.filterwarnings("ignore", module="urllib3")

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# Suppress thought_signature warnings from google-genai SDK
logging.getLogger("google_genai").setLevel(logging.ERROR)

app = FastAPI(
    title="LabPrint AI pH Analyze Backend",
    description="Python FastAPI backend supporting Gemini AI and OCR.Space providers",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str
    ocr_provider: str
    gemini_configured: bool
    ocr_space_configured: bool


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
    Health check endpoint to verify backend service status and active OCR provider.
    """
    gemini_key_set = bool(os.getenv("GEMINI_API_KEY"))
    ocr_space_key_set = bool(os.getenv("OCR_SPACE_API_KEY", "K86109868088957"))
    provider = os.getenv("OCR_PROVIDER", "gemini").strip().lower()

    logger.info(f"Health check endpoint hit. Provider: {provider}, Gemini key: {gemini_key_set}, OCR.Space key: {ocr_space_key_set}")
    
    return HealthResponse(
        status="online",
        service="LabPrint Backend",
        ocr_provider=provider,
        gemini_configured=gemini_key_set,
        ocr_space_configured=ocr_space_key_set
    )


@app.post("/api/analyze-image", response_model=SampleLabelAnalysis)
async def analyze_image(
    file: UploadFile = File(...),
    lang: str = Query("en", description="Localization language query parameter ('en' or 'vi')")
):
    """
    Endpoint to receive a lab pH image and process it via the configured OCR provider
    (Gemini API or OCR.Space Engine 3).
    """
    provider = os.getenv("OCR_PROVIDER", "gemini").strip().lower()
    logger.info(f"Received file for analysis: {file.filename}, type: {file.content_type}, lang: {lang}, provider: {provider}")

    # Localized file type validation error
    if not file.content_type or not file.content_type.startswith("image/"):
        if lang == "vi":
            err_msg = f"Tệp '{file.filename}' không phải là hình ảnh hợp lệ. Định dạng nhận được: {file.content_type}"
        else:
            err_msg = f"File '{file.filename}' is not a valid image. Received type: {file.content_type}"
        
        logger.warning(err_msg)
        raise HTTPException(status_code=400, detail=err_msg)

    try:
        # Read the file contents into bytes
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Loaded image successfully: {image.format} - {image.size}")

        # Dispatch to the configured provider (gemini vs ocr_space)
        if provider == "ocr_space":
            logger.info("Executing analysis via OCR.Space Service (Engine 3)...")
            parsed_result = await analyze_with_ocr_space(
                image_bytes=contents,
                filename=file.filename or "sample.jpg",
                content_type=file.content_type or "image/jpeg",
                lang=lang
            )
        else:
            logger.info("Executing analysis via Gemini AI Service (gemini-3.5-flash)...")
            parsed_result = await analyze_with_gemini(
                image=image,
                lang=lang
            )

        logger.info(f"Successfully extracted metadata ({provider}): {parsed_result}")

        # Image enhancement: Ink-Saver mode + text contrast boost
        # Convert to Grayscale (L) first to match Saturation = 0 and save all color ink
        enhanced_image = image.convert("L")

        # 1. Apply custom transfer curve (Levels adjustment):
        # Deepen dark values (p < 50) to keep text/digits solid black.
        # Shift and stretch mid-to-bright values aggressively to push them to pure white (255) to brighten LCD screens.
        enhanced_image = enhanced_image.point(lambda p: int(p * 0.5) if p < 50 else min(255, int((p - 50) * 2.1 + 110)))

        # Convert back to RGB mode for compatibility with standard browsers and canvas overlays
        enhanced_image = enhanced_image.convert("RGB")

        # 2. Boost contrast by 40% to make the text and screen digits stand out sharp against the whited-out background
        contrast_enhancer = ImageEnhance.Contrast(enhanced_image)
        enhanced_image = contrast_enhancer.enhance(1.4)

        # 3. Enhance sharpness by 50% to make the handwriting edges crisp
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
        error_str = str(e)
        logger.error(f"Error occurred during analysis ({provider}): {error_str}")
        
        # Parse quota/rate limit error (429 RESOURCE_EXHAUSTED)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "Quota exceeded" in error_str:
            import re
            
            # Extract retry delay in seconds
            retry_match = re.search(r"Please retry in ([\d\.]+)s", error_str)
            retry_sec = float(retry_match.group(1)) if retry_match else 60.0
            retry_sec_int = int(round(retry_sec))
            
            # Extract quota limit
            limit_match = re.search(r"limit: (\d+)", error_str)
            limit_val = int(limit_match.group(1)) if limit_match else 20
            
            # Construct friendly localized messages
            msg_vi = f"Bạn đã vượt quá hạn mức sử dụng miễn phí (tối đa {limit_val} lượt quét/ngày). Vui lòng thử lại sau {retry_sec_int} giây."
            msg_en = f"You have exceeded the free usage limit (max {limit_val} scans/day). Please try again in {retry_sec_int} seconds."
            detail_msg = msg_vi if lang == "vi" else msg_en
            
            return JSONResponse(
                status_code=429,
                content={
                    "error_type": "quota_exceeded",
                    "limit": limit_val,
                    "retry_after_seconds": retry_sec,
                    "message_vi": msg_vi,
                    "message_en": msg_en,
                    "detail": detail_msg
                }
            )

        # Parse 503 UNAVAILABLE Server Overload error
        if "503" in error_str or "UNAVAILABLE" in error_str:
            msg_vi = "Hệ thống AI hiện đang bị quá tải tạm thời. Vui lòng thử lại sau vài giây."
            msg_en = "AI service is currently experiencing high demand. Please try again in a few seconds."
            detail_msg = msg_vi if lang == "vi" else msg_en
            
            return JSONResponse(
                status_code=503,
                content={
                    "error_type": "server_overload",
                    "message_vi": msg_vi,
                    "message_en": msg_en,
                    "detail": detail_msg
                }
            )

        if lang == "vi":
            err_msg = f"Phân tích ảnh thất bại ({provider}): {error_str}"
        else:
            err_msg = f"Image analysis failed ({provider}): {error_str}"
        
        raise HTTPException(status_code=500, detail=err_msg)
