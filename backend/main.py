import os
import io
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
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

# Initialize API key pool
api_keys = []
for k, v in os.environ.items():
    if k.startswith("GEMINI_API_KEY") and v.strip():
        api_keys.append(v.strip())
# Sort keys to ensure stable order (e.g. GEMINI_API_KEY, GEMINI_API_KEY_2)
api_keys.sort()
if not api_keys:
    logger.warning("No GEMINI_API_KEY environment variables found!")
current_key_idx = 0

app = FastAPI(
    title="LabPrint AI pH Analyze Backend",
    description="Python FastAPI backend for image analysis using the official Google GenAI SDK",
    version="0.3.0",
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
    if not api_keys:
        if lang == "vi":
            err_msg = "Thiếu khóa Gemini API. Vui lòng thiết lập biến môi trường GEMINI_API_KEY trên Render."
        else:
            err_msg = "Missing Gemini API Key. Please set the GEMINI_API_KEY environment variable on Render."
        
        logger.warning(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)

    try:
        from google import genai
        from google.genai import types
        
        # Read the file contents and convert into a PIL Image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Loaded image successfully: {image.format} - {image.size}")

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

        global current_key_idx
        attempts = 0
        max_attempts = len(api_keys) if api_keys else 1
        response = None
        error_str = ""

        while attempts < max_attempts:
            api_key = api_keys[current_key_idx] if api_keys else None
            try:
                # Initialize the Gemini client with the current key
                client = genai.Client(api_key=api_key) if api_key else genai.Client()
                
                logger.info(f"Calling Gemini API (gemini-2.5-flash) in '{lang}' using key index {current_key_idx}...")
                
                # Call the Gemini model with structured output configuration
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[image, prompt_instructions],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=GeminiLabelExtraction,
                        temperature=0.1,
                    ),
                )
                break  # Success, exit retry loop
            
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "Quota exceeded" in error_str:
                    logger.warning(f"Quota exceeded for key index {current_key_idx}. Rotating to next key...")
                    if len(api_keys) > 1:
                        current_key_idx = (current_key_idx + 1) % len(api_keys)
                    attempts += 1
                else:
                    # Non-429 error, break and raise immediately
                    raise e
                    
        if not response:
            # If all keys failed with 429, raise the last exception
            raise Exception(error_str)

        parsed_result = response.parsed
        if not parsed_result:
            if lang == "vi":
                err_msg = "Mô hình Gemini không trả về dữ liệu cấu trúc."
            else:
                err_msg = "The Gemini model failed to return structured metadata."
            logger.error(err_msg)
            raise HTTPException(status_code=500, detail=err_msg)

        logger.info(f"Successfully extracted metadata from Gemini: {parsed_result}")

        # Image enhancement: Ink-Saver mode + text contrast boost
        from PIL import ImageEnhance
        import base64

        # Convert to Grayscale (L) first to match Saturation = 0 and save all color ink
        image = image.convert("L")

        # 1. Apply custom transfer curve (Levels adjustment):
        # Deepen dark values (p < 45) to p * 0.7 to keep text/digits solid black.
        # Shift and stretch mid-to-bright values aggressively to push them to pure white (255).
        image = image.point(lambda p: int(p * 0.7) if p < 45 else min(255, int((p - 45) * 1.7 + 30)))

        # Convert back to RGB mode for compatibility with standard browsers and canvas overlays
        image = image.convert("RGB")

        # 2. Boost contrast by 40% to make the text and screen digits stand out sharp against the whited-out background
        contrast_enhancer = ImageEnhance.Contrast(image)
        image = contrast_enhancer.enhance(1.4)

        # 3. Enhance sharpness by 50% to make the handwriting edges crisp
        sharpness_enhancer = ImageEnhance.Sharpness(image)
        image = sharpness_enhancer.enhance(1.5)

        # Encode processed image to base64
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=90)
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
        logger.error(f"Error occurred during Gemini analysis: {error_str}")
        
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
            msg_vi = "Hệ thống AI của Google hiện đang bị quá tải tạm thời. Vui lòng thử lại sau vài giây."
            msg_en = "Google AI models are currently experiencing high demand. Please try again in a few seconds."
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
            err_msg = f"Phân tích Gemini API thất bại: {error_str}"
        else:
            err_msg = f"Gemini API analysis failed: {error_str}"
        
        raise HTTPException(status_code=500, detail=err_msg)
