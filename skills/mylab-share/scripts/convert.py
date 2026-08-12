#!/usr/bin/env python3
"""Print a shareable mylab URL for HTML and optional CSS/JavaScript files."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

PLAY_URL = "https://mylab.wsm.one/play"
URI_SAFE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$"


def utf16_units(value: str) -> tuple[int, ...]:
    encoded = value.encode("utf-16-le", "surrogatepass")
    return tuple(int.from_bytes(encoded[index : index + 2], "little") for index in range(0, len(encoded), 2))


def compress_to_encoded_uri_component(value: str) -> str:
    """Match lz-string's compressToEncodedURIComponent output."""
    dictionary: dict[tuple[int, ...], int] = {}
    to_create: set[tuple[int, ...]] = set()
    enlarge_in = 2
    dictionary_size = 3
    num_bits = 2
    output: list[str] = []
    data_value = 0
    data_position = 0

    def write_bits(number: int, bit_count: int) -> None:
        nonlocal data_value, data_position
        for _ in range(bit_count):
            data_value = (data_value << 1) | (number & 1)
            if data_position == 5:
                output.append(URI_SAFE_ALPHABET[data_value])
                data_value = 0
                data_position = 0
            else:
                data_position += 1
            number >>= 1

    def use_dictionary_entry() -> None:
        nonlocal enlarge_in, num_bits
        enlarge_in -= 1
        if enlarge_in == 0:
            enlarge_in = 1 << num_bits
            num_bits += 1

    def write_word(word: tuple[int, ...], *, final: bool = False) -> None:
        if word in to_create:
            code_unit = word[0]
            write_bits(0 if code_unit < 256 else 1, num_bits)
            write_bits(code_unit, 8 if code_unit < 256 else 16)
            to_create.remove(word)
            use_dictionary_entry()
        else:
            write_bits(dictionary[word], num_bits)

        if not final:
            use_dictionary_entry()

    word: tuple[int, ...] = ()
    for code_unit in utf16_units(value):
        character = (code_unit,)
        if character not in dictionary:
            dictionary[character] = dictionary_size
            dictionary_size += 1
            to_create.add(character)

        word_and_character = word + character
        if word_and_character in dictionary:
            word = word_and_character
            continue

        write_word(word)
        dictionary[word_and_character] = dictionary_size
        dictionary_size += 1
        word = character

    if word:
        write_word(word, final=True)

    write_bits(2, num_bits)
    while True:
        data_value <<= 1
        if data_position == 5:
            output.append(URI_SAFE_ALPHABET[data_value])
            break
        data_position += 1

    return "".join(output)


def parse_file_list(value: str) -> list[Path]:
    return [Path(item).expanduser() for item in value.split(",") if item]


def read_text(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8")
    except OSError as error:
        raise argparse.ArgumentTypeError(f"cannot read {file_path}: {error.strerror}") from error


def attribute(tag: str, name: str) -> str | None:
    match = re.search(
        rf"\b{re.escape(name)}\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+))",
        tag,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return next(value for value in match.groups() if value is not None)


def refers_to_source(resource: str | None, html_path: Path, source_paths: set[Path]) -> bool:
    if not resource or re.match(r"^(?:[a-z][a-z\d+.-]*:|//|/|#)", resource, flags=re.IGNORECASE):
        return False

    resource_path = resource.split("?", 1)[0].split("#", 1)[0]
    return (html_path.parent / resource_path).resolve() in source_paths


def remove_supplied_file_tags(
    html: str, html_path: Path, css_paths: list[Path], js_paths: list[Path]
) -> str:
    css_sources = {file_path.resolve() for file_path in css_paths}
    js_sources = {file_path.resolve() for file_path in js_paths}

    def replace_link(match: re.Match[str]) -> str:
        tag = match.group(0)
        rel = attribute(tag, "rel")
        href = attribute(tag, "href")
        if rel and "stylesheet" in rel.split() and refers_to_source(href, html_path, css_sources):
            return ""
        return tag

    def replace_script(match: re.Match[str]) -> str:
        tag = match.group(0)
        return "" if refers_to_source(attribute(tag, "src"), html_path, js_sources) else tag

    html = re.sub(r"<link\b[^>]*>", replace_link, html, flags=re.IGNORECASE)
    return re.sub(r"<script\b[^>]*>[\s\S]*?</script\s*>", replace_script, html, flags=re.IGNORECASE)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print a compact shareable mylab URL for one HTML file and optional CSS and JavaScript files."
    )
    parser.add_argument("--html", required=True, type=Path, help="the single HTML file")
    parser.add_argument("--css", default="", help="comma-separated CSS files, in load order")
    parser.add_argument("--js", default="", help="comma-separated JavaScript files, in load order")
    arguments = parser.parse_args()

    html_path = arguments.html.expanduser().resolve()
    css_paths = parse_file_list(arguments.css)
    js_paths = parse_file_list(arguments.js)
    html_source = read_text(html_path)
    css_sources = [read_text(file_path) for file_path in css_paths]
    js_sources = [read_text(file_path) for file_path in js_paths]

    has_separate_files = bool(css_paths or js_paths)
    html = (
        remove_supplied_file_tags(html_source, html_path, css_paths, js_paths)
        if has_separate_files
        else html_source
    )
    params = urlencode(
        {
            "html": compress_to_encoded_uri_component(html),
            "css": compress_to_encoded_uri_component("\n".join(css_sources)),
            "js": compress_to_encoded_uri_component("\n;\n".join(js_sources)),
        }
    )
    print(f"{PLAY_URL}#{params}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except argparse.ArgumentTypeError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
