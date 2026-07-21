import os
import logging
from PIL import Image
from pydantic import BaseModel, Field

logger = logging.getLogger("backend.gemini")


class GeminiLabelExtraction(BaseModel):
    sample_id: str = Field(
        description="The sample ID code written in the label, e.g., '3878/16'"
    )
    measurement_run: int = Field(
        description="The run number, must be either 1 or 2"
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0 based on how clear the text is"
    )


async def analyze_with_gemini(image: Image.Image, lang: str = "en") -> GeminiLabelExtraction:
    """
    Analyzes lab image using Google Gemini API with Structured Outputs.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        if lang == "vi":
            raise ValueError("Thiếu khóa Gemini API. Vui lòng thiết lập biến môi trường GEMINI_API_KEY.")
        else:
            raise ValueError("Missing Gemini API Key. Please set the GEMINI_API_KEY environment variable.")

    from google import genai
    from google.genai import types

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

    client = genai.Client(api_key=api_key)
    logger.info(f"Calling Gemini API (gemini-3.5-flash) in '{lang}'...")

    response = await client.aio.models.generate_content(
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
            raise ValueError("Mô hình Gemini không trả về dữ liệu cấu trúc.")
        else:
            raise ValueError("The Gemini model failed to return structured metadata.")

    return parsed_result
