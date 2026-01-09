import json
import requests
from bs4 import BeautifulSoup
import re
from copy import copy
import arxiv

def get_id(title, year):
    clean_title = '_'.join([x.lower() for x in title.replace(",", "").split(' ')]).replace("__", "_")
    return f"{year}-{clean_title}"

ARXIV_CLIENT = arxiv.Client()

class ArXivURL:
    def __init__(self, name, year, url):
        self.name = name
        self.year = year
        self.url = url
        if url:
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
            url_object = ArXivURL(data["name"], data["year"], url=None) # passive load
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
                "year": results[0].published.year,
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
            print("Parsing Section...")
            for section in parser.body.find_all("section"):
                title_section = section.find(attrs={'class': 'ltx_title_section'})
                if title_section:
                    yield (section["id"], _clean(title_section.text))

        def _parse_reference(parser):
            print("Parsing References...")
            for item in parser.body.find_all(attrs={'class': 'ltx_bibitem'}):
                blocks = item.find_all(attrs={'class': 'ltx_bibblock'})
                if "“" in item.text and "”" in item.text: # authors, “title”, publication, year
                    authors = _clean(item.text.partition("“")[0])
                    title = _clean(item.text.partition("“")[2].partition("”")[0])
                    publication = _clean(item.text.partition("”")[2].rpartition(",")[0])
                    year = _get_year(item.text.partition("”")[2].rpartition(",")[2])
                else:
                    if len(blocks) == 1: # title, year
                        title = _clean(item.text.rpartition(",")[0])
                        year = _get_year(item.text.rpartition(",")[2])
                        authors, publication = None, None
                    else: # authors, title, (publication), year
                        if len(blocks) < 3: 
                            publication, year = None, _get_year(blocks[1].text.rpartition(",")[2])
                        else:
                            publication = _clean(blocks[2].text)
                            year = _get_year(
                                blocks[2].text.rpartition(",")[2]
                            )
                        title = _clean(blocks[1].text)
                        authors = _clean(blocks[0].text)

                content = {
                    "enum": item["id"].partition("bib.bib")[2],
                    "authors":authors,
                    "title": title,
                    "publication": publication,
                    "year": year,
                }
                _add_addl_info(content)
                content["id"] = get_id(title=content["title"], year=content["year"])
                yield content

        def _parse_citation(parser):
            print("Parsing Citations...")
            cites = []
            for cite in parser.body.find_all("cite"):
                try:
                    for a in cite.find_all("a"):
                        parent = cite.parent
                        while (not parent.get("id")) and hasattr(parent, "parent"):
                            parent = parent.parent
                        section_id = parent["id"].partition(".")[0]
                        cite_id = a["href"].replace("bib.bib", "").rpartition("#")[2]
                        # cite_enum = a.text.strip()
                        cite_enum = cite_id

                        for s in parent.get_text(strip=True).replace("al.", "al").split("."):
                            if a.text in s:
                                sentence = _clean(s)
                                break
                        else:
                            sentence, word = cite.text, None
                        cites.append(
                            {
                                "section_id": section_id,
                                "cite_enum": cite_enum,
                                "cite_id":cite_id,
                                "sentence": sentence,
                            }                
                        )
                except Exception as e:
                    print("[ERROR parsing citation]", e)
                    continue
            return cites

        def _parse_preview(parser):
            print("Parsing Preview...")
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
                    attr if attr != "url" else "standard_url": 
                        addl_info.get(attr, source_dict.get(attr))
                    for attr in ["authors", "summary", "url", "year"]
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
            "citations": _parse_citation(parser),
            "preview": _parse_preview(parser),
            "references": {
                block["enum"]: block
                for block in _parse_reference(parser)
            },
        }

        _add_addl_info(content)

        return content

if __name__ == '__main__':
    from ParserConfig import INPUT_CONFIG, DIRECTORY
    for name, year, url in INPUT_CONFIG:
        url_object = ArXivURL(name=name, year=year, url=url)
        url_object.json_dump(directory=DIRECTORY)