"""Bounded local extraction for user uploads; upload text is never approved knowledge."""
import io
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageOps
from pypdf import PdfReader

from backend.pdf_ingestion import OCR_DATA

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
OCR_LANGUAGES = {"English": "eng", "Hindi": "hin", "Marathi": "mar", "Gujarati": "guj"}


class DocumentError(ValueError):
    pass


def image_text(contents, language="English"):
    if language not in OCR_LANGUAGES:
        raise DocumentError("Unsupported OCR language")
    try:
        image = Image.open(io.BytesIO(contents))
        if image.width * image.height > 20_000_000:
            raise DocumentError("Image dimensions are too large. Use an image under 20 megapixels.")
        image.verify()
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(contents))).convert("RGB")
        if image.width * image.height > 20_000_000:
            raise DocumentError("Image dimensions are too large. Use an image under 20 megapixels.")
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("Could not read the uploaded file as an image.") from exc
    code = OCR_LANGUAGES[language]
    arguments = []
    # PDF OCR resources are private to the project, not the system tessdata.
    if (OCR_DATA / f"{code}.traineddata").exists() and (OCR_DATA / "eng.traineddata").exists():
        arguments = ["--tessdata-dir", str(OCR_DATA)]
    try:
        executable = shutil.which("tesseract") or "tesseract"
        listed = subprocess.run([executable, "--list-langs", *arguments], capture_output=True,
                                timeout=5, check=True, encoding="utf-8")
        available = set(listed.stdout.splitlines())
        if code not in available:
            raise DocumentError(f"{language} OCR is not installed. Run python -m backend.setup_rag first.")
        languages = code if code == "eng" else code + "+eng"
        with tempfile.TemporaryDirectory(prefix="agrogyan-image-") as temp:
            path = Path(temp) / "image.png"
            ImageOps.grayscale(image).save(path)
            output = subprocess.run([executable, str(path), "stdout", *arguments, "-l", languages],
                                    capture_output=True, timeout=20, check=True, encoding="utf-8")
            text = output.stdout.strip()
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("Local OCR is unavailable or timed out. Try a clearer, smaller image.") from exc
    if not text:
        raise DocumentError("No readable text was found. Upload a clear photo of a notice or document; OCR cannot diagnose a crop photo.")
    return text


def document_text(contents, filename, language="English"):
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".pdf" or contents.startswith(b"%PDF"):
        try:
            reader = PdfReader(io.BytesIO(contents))
            if len(reader.pages) > 100:
                raise DocumentError("Use a PDF with at most 100 pages.")
            parts = []
            for number, page in enumerate(reader.pages, 1):
                text = (page.extract_text() or "").strip()
                if text:
                    parts.append(f"Page {number}\n{text}")
            if not parts:
                raise DocumentError("This PDF has no readable text. Scanned PDFs need OCR; upload a clear page image instead.")
            return "\n\n".join(parts)
        except DocumentError:
            raise
        except Exception as exc:
            raise DocumentError("Could not parse the PDF. It may be damaged or encrypted.") from exc
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}:
        return image_text(contents, language)
    if suffix in {".txt", ".csv"}:
        try:
            text = contents.decode("utf-8-sig").strip()
        except UnicodeDecodeError as exc:
            raise DocumentError("Text documents must use UTF-8 encoding.") from exc
        if not text or "\x00" in text:
            raise DocumentError("The uploaded document contains no readable text.")
        return text
    raise DocumentError("Supported uploads are PDF, text, CSV, and images.")
