import json
import requests
from bs4 import BeautifulSoup
import re
from copy import copy
import arxiv

def get_id(title, year):
    clean_title = '_'.join([x.lower() for x in title.replace(",", "").split(' ')])
    return f"{year}-{clean_title}"

ARXIV_CLIENT = arxiv.Client()

class ArXivURL:
    def __init__(self, name, year, url):
        self.name = name
        self.year = year
        self.url = url
        self.html_content = self.get_html_content(url)
        self.parser = BeautifulSoup(self.html_content, 'html.parser', from_encoding='utf-8')
        for k, v in self.parse_content(self.parser).items():
            setattr(self, k, v)
        self.id = get_id(title=self.title, year=self.year)
        
    def __repr__(self):
        return json.dumps({k: v for k, v in self.__dict__.items() if k not in ["html_content", "parser"]}, indent=2)

    def json_dump(self, directory="paper_json"):
        output_path = f"{directory}/{get_id(self.title, self.year)}.json"
        with open(output_path, "w") as f:
            json.dump(json.loads(self.__repr__()), f, ensure_ascii=False, indent=2)
            print(f"{output_path} is saved.")

    @staticmethod
    def json_load(input_path):
        url_object = None
        with open(input_path) as f:
            data = json.load(f)
            url_object = ArXivURL(data["name"], data["year"], data["url"])
            for k, v in data.items():
                setattr(url_object, k, v)
        return url_object
    
    @staticmethod
    def get_html_content(url):
        html_content = None
        try:
            html_content = requests.get(url).content
        except Exception:
            return None
        return html_content

    @staticmethod
    def lookup_arXiv(title):
        query = f'ti:"{title}"'
        search = arxiv.Search(
            query=query, max_results=1, sort_by=arxiv.SortCriterion.Relevance
        )
        results = list(ARXIV_CLIENT.results(search))
        if results:
            return {
                "url": results[0].entry_id,
                "summary": results[0].summary,
                "authors": ", ".join([x["name"] for x in results[0]._raw["authors"]]),
            }
        return {}

    @classmethod
    def parse_content(cls, parser):
        """
            arXiv experimental HTML format
        """
        def _clean(text):
            return text.replace('\xa0', ' ').replace('\n', ' ').strip().strip(".")

        def _get_year(text):
            match = re.search(r"\b\d{4}\b", _clean(text))
            if match:
                return match.group()
            return None
        
        def _parse_section(parser):
            for section in parser.body.find_all("section"):
                title_section = section.find(attrs={'class': 'ltx_title_section'})
                if title_section:
                    yield (section["id"], _clean(title_section.text))

        def _parse_reference(parser):
            for item in parser.body.find_all(attrs={'class': 'ltx_bibitem'}):
                blocks = item.find_all(attrs={'class': 'ltx_bibblock'})
                if len(blocks) < 3:
                    publication, year = None, _get_year(blocks[1].text.rpartition(",")[2])
                else:
                    publication, year = _clean(blocks[2].text), _get_year(blocks[2].text.rpartition(",")[2])
                title = _clean(blocks[1].text)
                content = {
                    "id": get_id(title=title, year=year),
                    "enum": item["id"].partition("bib.bib")[2],
                    "authors":_clean(blocks[0].text),
                    "title": title,
                    "publication": publication,
                    "year": year,
                }
                _add_addl_info(content)
                yield content

        def _parse_citation(parser):
            cites = []
            for cite in parser.body.find_all("cite"):
                try:
                    for a in cite.find_all("a"):
                        section_id = cite.parent["id"].partition(".")[0]
                        cite_enum = a.text.strip()
                        cite_id = a["href"].rpartition("#")[2]
                        
                        for s in cite.parent.get_text(strip=True).split("."):
                            if str(cite_enum) in s:
                                sentence = _clean(s)
                                break
                        else:
                            sentence, word = None, None
                        cites.append(
                            {
                                "section_id": section_id,
                                "cite_enum": cite_enum,
                                "cite_id":cite_id,
                                "sentence": sentence,
                            }                
                        )
                except Exception:
                    continue
            return cites

        def _parse_preview(parser):
            html = ""
            for para in parser.body.find("section").find_all(attrs={'class': 'ltx_para'}):
                copy_para = copy(para)

                for cite in copy_para.find_all('cite'):
                    cite.decompose();
                html += str(copy_para)
            return html

        def _add_addl_info(source_dict):
            try:
                addl_info = cls.lookup_arXiv(source_dict["title"])
                source_dict.update({
                    "authors": addl_info.get("authors", source_dict.get("authors")),
                    "summary": addl_info.get("summary", source_dict.get("summary")),
                    "standard_url": addl_info.get("url", source_dict.get("standard_url")),
                })
            except Exception as e:
                print(e)
                
        content = {
            "parser": parser,
            "title": _clean(parser.body.find(attrs={'class': 'ltx_title_document'}).text),
            "sections": {
                _id: text
                for _id, text in _parse_section(parser)
            },
            "references": {
                block["enum"]: block
                for block in _parse_reference(parser)
            },
            "citations": _parse_citation(parser),
            "preview": _parse_preview(parser),
        }

        _add_addl_info(content)

        return content

if __name__ == '__main__':
    from ParserConfig import INPUT_CONFIG, DIRECTORY
    for name, year, url in INPUT_CONFIG:
        url_object = ArXivURL(name=name, year=year, url=url)
        url_object.json_dump(directory=DIRECTORY)