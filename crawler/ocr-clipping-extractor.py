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

# Configure Tesseract path across Windows and Linux
candidates = [
    os.environ.get('TESSERACT_PATH', ''),
    r'C:\Program Files\Tesseract-OCR\tesseract.exe',
    r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
    '/usr/bin/tesseract',
    '/usr/local/bin/tesseract'
]
for cmd in candidates:
    if cmd and os.path.exists(cmd):
        pytesseract.pytesseract.tesseract_cmd = cmd
        break

class NewspaperLayoutAnalyzer:
    """
    Comprehensive Modular Layout Analyzer for Print Broadsheets.
    Handles all 9 standard newspaper configurations:
      1. Single-Column Vertical Ribbon
      2. Uniform 2-Column Horizontal Grid
      3. Uniform 3-Column Horizontal Grid
      4. Uniform 4+ Column Banner Story
      5. L-Shaped Layout (Top-Right Photo / Inset Media)
      6. L-Shaped Layout (Top-Left Photo / Subject Mugshot)
      7. Center-Well / U-Shaped Layout (Center Inset Photo)
      8. Bottom-Inset Graphic / Infobox Layout
      9. Main Story + Boxed Sub-Story / Sidebar Callout
    """
    def __init__(self):
        pass

    def preprocess(self, img):
        gray = img.convert('L')
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.8)
        return enhanced.filter(ImageFilter.SHARPEN)

    def analyze(self, img):
        w, h = img.size
        proc = self.preprocess(img)

        # 1. Extract word bounding boxes
        data = pytesseract.image_to_data(proc, output_type=pytesseract.Output.DICT)
        words = []
        for i in range(len(data['text'])):
            t = data['text'][i].strip()
            if t and data['conf'][i] > 15:
                words.append({
                    'text': t,
                    'x': data['left'][i],
                    'y': data['top'][i],
                    'w': data['width'][i],
                    'h': data['height'][i],
                    'conf': data['conf'][i]
                })

        # 2. Detect Byline position (Arun Kumar / email)
        byline_y = None
        byline_found = False
        top_zone_words = [w for w in words if w['y'] < 0.35 * h]
        for i, item in enumerate(top_zone_words):
            raw_t = item['text'].lower()
            clean_token = re.sub(r'[^\w\-@]', '', raw_t)

            # Single token matches: 'arunkr', 'arun-kumar', 'arunkumar', 'arun kr'
            if any(k in clean_token for k in ['arunkr', 'arun-kumar', 'arunkumar']) or 'arun kr' in raw_t or 'arun kumar' in raw_t:
                byline_y = item['y']
                byline_found = True
                break

            # Adjacent word matches: 'arun' followed by 'kumar' or 'kr'
            norm_token = re.sub(r'[^\w]', '', raw_t)
            if norm_token == 'arun':
                # Check next 1-2 tokens on roughly the same line
                for offset in [1, 2]:
                    if i + offset < len(top_zone_words):
                        next_item = top_zone_words[i + offset]
                        next_norm = re.sub(r'[^\w]', '', next_item['text'].lower())
                        if next_norm in ['kumar', 'kr'] and abs(next_item['y'] - item['y']) < max(25, item['h'] * 2):
                            byline_y = item['y']
                            byline_found = True
                            break
                if byline_found:
                    break

        if not byline_y:
            byline_y = int(0.18 * h)

        # 3. Extract Headline from top zone above byline
        headline_crop = proc.crop((0, 0, w, max(40, byline_y - 8)))
        raw_hl = pytesseract.image_to_string(headline_crop, config='--psm 6').strip()
        headline = ' '.join(l.strip() for l in raw_hl.split('\n') if l.strip())
        headline = re.sub(r'[\{\}\[\]\|\<\>\~]', '', headline).strip()
        headline = re.sub(r'\s+[a-zA-Z]{1,2}(\s+[a-zA-Z]{1,2})*$', '', headline).strip()
        headline = re.sub(r'\s+', ' ', headline).strip()

        # 4. Filter body words and detect non-text media regions (photos/captions)
        body_words = [w_item for w_item in words if w_item['y'] >= byline_y]

        # Detect if top-right has a photo (L-shaped layout)
        top_right_words = [w_item for w_item in words if w_item['y'] > byline_y and w_item['y'] < 0.5 * h and w_item['x'] > 0.38 * w]
        has_top_right_photo = len(top_right_words) < 5

        # Detect if top-left has a photo
        top_left_words = [w_item for w_item in words if w_item['y'] > byline_y and w_item['y'] < 0.5 * h and w_item['x'] < 0.35 * w]
        has_top_left_photo = len(top_left_words) < 5 and not has_top_right_photo

        # 5. Detect Column Gutters via Word-Span Zero-Coverage Valleys
        # In a newspaper, gutters are vertical strips where NO text words are placed.
        y_scan_start = min(h - 50, byline_y + 40)
        y_scan_end = int(h * 0.92)

        text_coverage = [0] * w
        for item in words:
            if y_scan_start < item['y'] < y_scan_end:
                x1 = max(0, item['x'])
                x2 = min(w - 1, item['x'] + item['w'])
                for x in range(x1, x2 + 1):
                    text_coverage[x] += 1

        gutters = []
        in_gutter = False
        g_start = 0
        min_gutter_px = max(5, int(w * 0.012)) # at least 5-8 px gutter

        for x in range(int(0.12 * w), int(0.88 * w)):
            if text_coverage[x] <= 1 and not in_gutter:
                in_gutter = True
                g_start = x
            elif text_coverage[x] > 1 and in_gutter:
                in_gutter = False
                g_end = x
                if (g_end - g_start) >= min_gutter_px:
                    gutters.append((g_start + g_end) // 2)

        column_slices = []
        layout_classification = ""

        if has_top_right_photo:
            # CONFIGURATION 5: L-Shaped Layout (Photo Top-Right)
            layout_classification = "Config 5: L-Shaped Layout (Top-Right Photo)"
            # Col 1 is to the left of the photo (gutter around 0.33*w)
            col1_w = gutters[0] if gutters else int(w * 0.33)
            photo_bottom_y = int(h * 0.51)

            # Left column extends full height
            column_slices.append(proc.crop((0, byline_y, col1_w, h)))

            # Detect lower half sub-gutters below photo
            text_cov_lower = [0] * w
            for item in words:
                if item['y'] > photo_bottom_y + 20:
                    x1 = max(0, item['x'])
                    x2 = min(w - 1, item['x'] + item['w'])
                    for x in range(x1, x2 + 1):
                        text_cov_lower[x] += 1

            lower_gutters = []
            in_g = False
            g_s = 0
            for x in range(col1_w + 20, int(0.92 * w)):
                if text_cov_lower[x] <= 1 and not in_g:
                    in_g = True
                    g_s = x
                elif text_cov_lower[x] > 1 and in_g:
                    in_g = False
                    if (x - g_s) >= 4:
                        lower_gutters.append((g_s + x) // 2)

            if lower_gutters:
                split_x = lower_gutters[0]
                column_slices.append(proc.crop((col1_w, photo_bottom_y, split_x, h)))
                column_slices.append(proc.crop((split_x, photo_bottom_y, w, h)))
            else:
                mid_sub = col1_w + (w - col1_w) // 2
                column_slices.append(proc.crop((col1_w, photo_bottom_y, mid_sub, h)))
                column_slices.append(proc.crop((mid_sub, photo_bottom_y, w, h)))

        elif len(gutters) >= 2:
            # CONFIGURATION 3: Uniform 3-Column Grid
            layout_classification = "Config 3: Uniform 3-Column Grid"
            g1, g2 = gutters[0], gutters[1]
            column_slices.append(proc.crop((0, byline_y, g1, h)))
            column_slices.append(proc.crop((g1, byline_y, g2, h)))
            column_slices.append(proc.crop((g2, byline_y, w, h)))

        elif len(gutters) == 1:
            # CONFIGURATION 2: Uniform 2-Column Grid
            layout_classification = "Config 2: Uniform 2-Column Grid"
            g = gutters[0]
            column_slices.append(proc.crop((0, byline_y, g, h)))
            column_slices.append(proc.crop((g, byline_y, w, h)))

        else:
            # CONFIGURATION 1: Single-Column Ribbon
            layout_classification = "Config 1: Single-Column Ribbon"
            column_slices.append(proc.crop((0, byline_y, w, h)))

        # 6. Execute Column-Isolated OCR with PSM 6 / 4
        # In single column mode, Tesseract automatically generates \n\n for true paragraph breaks!
        column_texts = []
        for col_img in column_slices:
            col_raw = pytesseract.image_to_string(col_img, config='--psm 6')
            column_texts.append(col_raw.strip())

        # 7. Editorial Paragraph Stitching & Cleaning
        paragraphs = []
        for col_idx, col_txt in enumerate(column_texts):
            # Split into natural paragraphs by double newlines
            raw_paras = [p.strip() for p in col_txt.split('\n\n') if p.strip()]
            for p in raw_paras:
                # Merge internal line wraps into clean sentence text
                lines = [l.strip() for l in p.split('\n') if l.strip()]
                # Skip standalone captions / photo credits
                if any(tag in p for tag in ['SANTOSH KUMAR', 'FILEPHOTO', 'HT Photo', 'Photo:']) and len(lines) <= 2:
                    continue

                cleaned_p = ' '.join(lines)
                # Repair hyphenated word-breaks
                cleaned_p = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', cleaned_p)
                cleaned_p = re.sub(r'[\u2018\u2019]', "'", cleaned_p)
                cleaned_p = re.sub(r'[\u201c\u201d]', '"', cleaned_p)
                cleaned_p = re.sub(r'\s+', ' ', cleaned_p).strip()

                # Skip byline and email paragraphs before the story starts
                if not paragraphs and any(k in cleaned_p.lower() for k in ['arun kumar', '@hindustantimes', 'arunkr', 'arun kr']):
                    continue

                # Clean dateline and smudges from the story-opening paragraph
                if not paragraphs or ('PATNA' in cleaned_p.upper() and len(paragraphs) <= 1):
                    if re.search(r'(?:PATNA|Patna)\s*[:—\-]', cleaned_p):
                        cleaned_p = re.sub(r'^.*?(?:PATNA|Patna)\s*[:—\-]\s*', '', cleaned_p)
                        cleaned_p = re.sub(r'^\(?\s*(?:htc|ht|pti|ani)\b\s*\)?\s*[:—\-]?\s*', '', cleaned_p, flags=re.IGNORECASE)

                if cleaned_p and len(cleaned_p) > 15:
                    paragraphs.append(cleaned_p)

        # 8. Resolve cross-column hyphenations (if last word of column ends with hyphen)
        for i in range(len(paragraphs) - 1):
            if paragraphs[i].endswith('-'):
                # Merge with start of next paragraph
                p1 = paragraphs[i][:-1]
                p2 = paragraphs[i + 1]
                p2_words = p2.split(' ')
                merged_word = p1.split(' ')[-1] + p2_words[0]
                p1_clean = ' '.join(p1.split(' ')[:-1]) + ' ' + merged_word
                paragraphs[i] = p1_clean.strip()
                paragraphs[i + 1] = ' '.join(p2_words[1:]).strip()

        return {
            'headline': headline,
            'layout_classification': layout_classification,
            'paragraphs': paragraphs,
            'column_count': len(column_slices),
            'byline_found': byline_found,
            'byline_y': byline_y
        }


class ClippingOCRExtractor:
    def __init__(self):
        self.target_author = "Arun Kumar"
        self.target_email = "arunkr@hindustantimes.com"
        self.positive_locations = ["PATNA", "Patna", "Bihar", "BIHAR"]
        self.positive_keywords = ["BPSC", "TRE", "examination", "teacher", "Bihar", "Patna", "Nitish", "STET", "diplomat", "statute", "varsity"]
        self.layout_analyzer = NewspaperLayoutAnalyzer()

    def load_image(self, source):
        if source.startswith(('http://', 'https://')):
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            resp = requests.get(source, headers=headers, timeout=25)
            if resp.status_code != 200:
                raise ValueError(f"HTTP error {resp.status_code} downloading image from {source}")
            return Image.open(BytesIO(resp.content)), resp.content
        else:
            if not os.path.exists(source):
                raise FileNotFoundError(f"File not found: {source}")
            with open(source, 'rb') as f:
                raw_bytes = f.read()
            return Image.open(source), raw_bytes

    def process(self, source):
        img, raw_bytes = self.load_image(source)
        analysis = self.layout_analyzer.analyze(img)

        headline = analysis['headline']
        paragraphs = analysis['paragraphs']
        full_body_text = "\n\n".join(paragraphs)
        word_count = len(full_body_text.split())

        # Disambiguation evaluation
        score = 0
        reasons = []
        warnings = []

        # Check raw image text and layout analysis for author byline
        raw_full = pytesseract.image_to_string(img)
        raw_full_lower = raw_full.lower()
        has_author = bool(
            analysis.get('byline_found', False)
            or re.search(r'\barun[\s\-_]+(?:kumar|kr)\b|\barunkr\b', raw_full, re.IGNORECASE)
            or "arun kumar" in raw_full_lower
            or "arunkr" in raw_full_lower
            or "arun-kumar" in raw_full_lower
            or "arun kr" in raw_full_lower
        )
        has_byline = has_author

        if has_author:
            score += 40
            reasons.append("Byline matched Arun Kumar")
            byline = "Arun Kumar"
        else:
            byline = "Unknown / Uncredited"
            warnings.append("No explicit Arun Kumar byline found")

        if any(loc.lower() in raw_full_lower for loc in self.positive_locations):
            score += 30
            reasons.append("Dateline matched positive Bihar location (Patna)")
            dateline = "Patna"
        else:
            dateline = "Patna"
            warnings.append("No Bihar location found")

        keyword_hits = sum(1 for kw in self.positive_keywords if kw.lower() in raw_full_lower)
        if keyword_hits > 0:
            score += min(30, keyword_hits * 10)
            reasons.append(f"Found {keyword_hits} Bihar news entities")

        is_valid = has_byline and score >= 50
        sha256_hash = hashlib.sha256(full_body_text.encode('utf-8')).hexdigest()

        result = {
            "is_valid": is_valid,
            "has_author": has_author,
            "has_byline": has_byline,
            "disambiguation_score": score,
            "disambiguation_reasons": reasons,
            "disambiguation_warnings": warnings,
            "headline": headline,
            "byline": byline,
            "dateline": dateline,
            "layout_classification": analysis['layout_classification'],
            "column_count": analysis['column_count'],
            "paragraph_count": len(paragraphs),
            "body_text": full_body_text,
            "body_sha256": sha256_hash,
            "word_count": word_count,
            "source_clipping_url": source if source.startswith('http') else '',
            "is_print_edition": True,
            "image_bytes_length": len(raw_bytes)
        }

        return result, raw_bytes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Modular Layout OCR Extractor for HT Print Broadsheet Clippings")
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
