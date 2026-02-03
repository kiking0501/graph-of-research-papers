### To add new papers...
- modify CONFIG.py to set `INPUT_CONFIG` with the new papers' (name, year, url). Currently support parsing urls from `arxiv.org/html` or `ar5iv.labs.arxiv.org/html`
- run `python3 ArXivURL.py`. New json files would be generated under the `paper_json/` folder.
- modify CONFIG.py again, add the name of the new json files to `OUTPUT_FILES`
- run `python3 TangledTreeBuilder.py`. to re-generate the visualization tree layout with the new content (saved as `complete_tree.json`)
