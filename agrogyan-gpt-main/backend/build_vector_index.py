"""Build/reuse the persistent index: python -m backend.build_vector_index."""
import json
import logging

from backend.data_loader import load_corpus
from backend.vector_store import OllamaEmbeddings, VectorStore


def main():
    logging.basicConfig(level=logging.INFO)
    documents, report = load_corpus()
    index = VectorStore(documents, OllamaEmbeddings())
    print(json.dumps({"ingestion": report, "vector_index": index.status()}, indent=2))


if __name__ == "__main__":
    main()
