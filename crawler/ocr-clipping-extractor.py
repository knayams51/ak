import os
import sys
import json
import re
import hashlib
import argparse
import requests
from io import BytesIO
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract

# Configure Tesseract path on Windows
TESSERACT_CMD = os.environ.get('TESSERACT_PATH', r'C:\Program Files\Tesseract-OCR\tesseract.exe')
if os.path.exists(TESSERACT_CMD):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

class ClippingOCRExtractor:
    def __init__(self):
        self.target_author = "Arun Kumar"
        self.target_email = "arunkr@hindustantimes.com"
        self.positive_locations = ["PATNA", "Patna", "Bihar", "BIHAR"]
        self.positive_keywords = ["BPSC", "TRE", "examination", "teacher", "Bihar", "Patna", "Nitish", "STET"]

    def load_image(self, source):
        if source.startswith(('http://', 'https://')):
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            resp = requests.get(source, headers=headers, timeout=20)
            if resp.status_code != 200:
                raise ValueError(f"HTTP error {resp.status_code} downloading image from {source}")
            return Image.open(BytesIO(resp.content)), resp.content
        else:
            if not os.path.exists(source):
                raise FileNotFoundError(f"File not found: {source}")
            with open(source, 'rb') as f:
                raw_bytes = f.read()
            return Image.open(source), raw_bytes

    def preprocess_image(self, img):
        # Convert to grayscale
        gray = img.convert('L')
        # Enhance contrast
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.8)
        # Slight sharpening
        sharpened = enhanced.filter(ImageFilter.SHARPEN)
        return sharpened

    def extract_text(self, img):
        preprocessed = self.preprocess_image(img)
        # Run PSM 1 (automatic page segmentation with OSD) or PSM 3 (fully automatic)
        config = '--oem 3 --psm 3'
        raw_text = pytesseract.image_to_string(preprocessed, config=config)
        return raw_text

    def parse_article(self, raw_text, source_url=""):
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        headline = ""
        byline = ""
        dateline = "Patna"
        body_lines = []
        
        byline_found = False
        dateline_found = False
        
        for i, line in enumerate(lines):
            # Check for author byline
            if re.search(r'Arun\s+Kumar', line, re.I) or re.search(r'arunkr@hindustantimes\.com', line, re.I):
                byline = "Arun Kumar"
                byline_found = True
                if not headline and i > 0:
                    headline = " ".join(lines[:i]).strip()
                continue
                
            # Check for dateline e.g. "PATNA : The Bihar..." or "PATNA:"
            dateline_match = re.match(r'^(PATNA|Patna)\s*[:—\-]\s*(.*)$', line, re.I)
            if dateline_match:
                dateline_found = True
                dateline = dateline_match.group(1).capitalize()
                remainder = dateline_match.group(2).strip()
                if remainder:
                    body_lines.append(remainder)
                continue
                
            # If byline hasn't been found yet, likely part of headline
            if not byline_found and not dateline_found:
                if not headline:
                    headline = line
                elif len(headline.split()) < 12:
                    headline += " " + line
                continue
                
            # Skip image captions or photo credits
            if re.search(r'(SANTOSH KUMAR|Photo:|HT Photo|Gardanibagh)', line, re.I) and len(line) < 60:
                continue
                
            body_lines.append(line)

        # Clean headline - strip trailing small noise characters or symbols
        headline = re.sub(r'[\{\}\[\]\|\<\>\~]', '', headline).strip()
        headline = re.sub(r'\s+[a-zA-Z]{1,2}(\s+[a-zA-Z]{1,2})*$', '', headline).strip()
        headline = re.sub(r'\s+', ' ', headline).strip()
        
        # Build body paragraphs
        raw_body = " ".join(body_lines)
        # Fix email residue from byline box e.g. "arunkr@hindustantimes.com"
        raw_body = re.sub(r'^.*?@(?:hindustantimes|ht)\.com\s*', '', raw_body, flags=re.I)
        raw_body = re.sub(r'^[^\w]*unk[^\w]*@.*?com\s*', '', raw_body, flags=re.I)
        # Fix hyphenated line-breaks e.g. "pro- cedure" -> "procedure"
        cleaned_body = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', raw_body)
        cleaned_body = re.sub(r'[\u2018\u2019]', "'", cleaned_body)
        cleaned_body = re.sub(r'[\u201c\u201d]', '"', cleaned_body)
        cleaned_body = re.sub(r'\s+', ' ', cleaned_body).strip()
        
        # Format into coherent paragraphs by sentence clusters
        sentences = re.split(r'(?<=[.!?])\s+', cleaned_body)
        paragraphs = []
        curr_p = []
        for s in sentences:
            curr_p.append(s)
            if len(curr_p) >= 2 or len(" ".join(curr_p)) > 250:
                paragraphs.append(" ".join(curr_p).strip())
                curr_p = []
        if curr_p:
            paragraphs.append(" ".join(curr_p).strip())
            
        full_body_text = "\n\n".join(paragraphs) if paragraphs else cleaned_body

        # Disambiguation Evaluation
        score = 0
        reasons = []
        warnings = []
        
        if byline_found or "arun kumar" in raw_text.lower():
            score += 40
            reasons.append("Byline matched Arun Kumar")
            byline = "Arun Kumar"
        else:
            warnings.append("No explicit Arun Kumar byline found")
            
        if dateline_found or any(loc.lower() in raw_text.lower() for loc in self.positive_locations):
            score += 30
            reasons.append("Dateline matched positive Bihar location (Patna)")
        else:
            warnings.append("No Bihar location found")
            
        keyword_hits = sum(1 for kw in self.positive_keywords if kw.lower() in raw_text.lower())
        if keyword_hits > 0:
            score += min(30, keyword_hits * 10)
            reasons.append(f"Found {keyword_hits} Bihar news entities")

        is_valid = score >= 50 and byline == "Arun Kumar"
        sha256_hash = hashlib.sha256(full_body_text.encode('utf-8')).hexdigest()

        return {
            "is_valid": is_valid,
            "disambiguation_score": score,
            "disambiguation_reasons": reasons,
            "disambiguation_warnings": warnings,
            "headline": headline,
            "byline": byline or "Arun Kumar",
            "dateline": dateline,
            "body_text": full_body_text,
            "body_sha256": sha256_hash,
            "word_count": len(full_body_text.split()),
            "source_clipping_url": source_url,
            "is_print_edition": True
        }

    def process(self, source):
        img, raw_bytes = self.load_image(source)
        raw_text = self.extract_text(img)
        result = self.parse_article(raw_text, source_url=source if source.startswith('http') else '')
        result["image_bytes_length"] = len(raw_bytes)
        return result, raw_bytes

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR Extractor for HT Print Newspaper Clippings")
    parser.add_argument("--url", help="Image URL from X/Twitter")
    parser.add_argument("--file", help="Local image file path")
    parser.add_argument("--out", help="Output JSON path")
    args = parser.parse_args()

    source = args.url or args.file
    if not source:
        print("Usage: python ocr-clipping-extractor.py --url <URL> or --file <PATH>")
        sys.exit(1)

    extractor = ClippingOCRExtractor()
    try:
        result, _ = extractor.process(source)
        output_json = json.dumps(result, indent=2)
        if args.out:
            with open(args.out, 'w', encoding='utf-8') as f:
                f.write(output_json)
        print(output_json)
    except Exception as e:
        print(json.dumps({"error": str(e), "is_valid": False}))
        sys.exit(1)
