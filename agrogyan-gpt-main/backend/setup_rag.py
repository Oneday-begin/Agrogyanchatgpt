"""One-time local model/OCR setup: python -m backend.setup_rag."""
import os
import shutil
from pathlib import Path

import requests

from backend.pdf_ingestion import OCR_DATA


def main():
    base = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    response = requests.get(f"{base}/api/tags", timeout=(2, 5))
    response.raise_for_status()
    installed = {m["name"] for m in response.json().get("models", [])}
    for model in (os.getenv("EMBEDDING_MODEL", "embeddinggemma"), os.getenv("OLLAMA_MODEL", "qwen3:0.6b")):
        name = model if ":" in model else model + ":latest"
        if name not in installed:
            print(f"Downloading {model}; this is needed only once.", flush=True)
            with requests.post(f"{base}/api/pull", json={"model": model, "stream": True},
                               stream=True, timeout=(2, 60)) as download:
                download.raise_for_status()
                import json
                for line in download.iter_lines():
                    if line:
                        status = json.loads(line)
                        if status.get("error"):
                            raise RuntimeError(status["error"])
    if not shutil.which("tesseract"):
        raise RuntimeError("Install Tesseract OCR and add it to PATH to read scanned PDFs")
    OCR_DATA.mkdir(parents=True, exist_ok=True)
    for language in ("guj", "eng", "hin", "mar"):
        path = OCR_DATA / f"{language}.traineddata"
        if not path.exists():
            response = requests.get(f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{language}.traineddata",
                                    timeout=(5, 60))
            response.raise_for_status()
            if len(response.content) < 100000:
                raise RuntimeError("OCR language download is incomplete")
            temporary = path.with_suffix(".download")
            temporary.write_bytes(response.content)
            temporary.replace(path)
    print("Embedding, answer model, and English/Hindi/Marathi/Gujarati OCR resources are ready.")


if __name__ == "__main__":
    main()
