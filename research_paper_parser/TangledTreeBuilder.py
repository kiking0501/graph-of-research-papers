from collections import defaultdict
import json

def get_id(title, year):
    clean_title = '_'.join([x.lower() for x in title.replace(",", "").split(' ')])
    return f"{year}-{clean_title}"

class TangledTreeBuilder:
    def __init__(self, url_list):
        self.url_list = url_list
        self.tree = self.run()

    def run(self):
        def order_topologically(nodes, parents_map):
            levels = {}
            
            def get_node_level(node_id):
                if node_id in levels:
                    return levels[node_id]
    
                level = 0
                parents = parents_map.get(node_id, defaultdict(set))
                if parents:
                    level = max(get_node_level(p) for p in parents.keys()) + 1
                levels[node_id] = level
                return level
        
            nodes_by_level = defaultdict(list)
            for node in nodes:
                level = get_node_level(node["id"])
                if parents_map[node["id"]]:
                    node["parents"] = {k: list(v) for k, v in parents_map[node["id"]].items()}
                nodes_by_level[level].append(node)            
            return nodes_by_level
        
        nodes, edges = self.build_nodes_edges(self.url_list)
        
        parents_map = defaultdict(lambda: defaultdict(set))
        for e in edges:
            parents_map[e["target"]][e["source"]].add(e["cite_sentence"])
            
        nodes_by_level = order_topologically(nodes, parents_map)            
        max_level = max(nodes_by_level.keys()) if nodes_by_level else -1
        result = [
            sorted(nodes_by_level[i], key=lambda x: x["id"], reverse=True) 
            for i in range(max_level + 1)
        ]
        return result

    def json_dump(self, output_path):
        with open(output_path, "w") as f:
            json.dump(self.tree, f, ensure_ascii=False, indent=2)
            print(f"{output_path} is saved.")

    @classmethod
    def get_core_node(cls, title, year, authors=None, name=None):
        return {
            "id": get_id(title, year),
            "type": "core",
            "title": title,
            "year": year,
            "authors": authors,
            "name": name,
        }

    @classmethod
    def build_reference_nodes(cls, url_object):
        nodes = []
        for ref in url_object.references.values():
            nodes.append(cls.get_core_node(title=ref["title"], year=ref["year"], authors=ref["authors"]))
        return nodes

    @classmethod
    def build_citation_edges(cls, url_object):
        links = []
        for cite in url_object.citations:
            links.append(
                {
                    "source": url_object.id,
                    "target": url_object.references[cite["cite_enum"]]["id"],
                    "type": "related",
                    "cite_sentence": cite["sentence"],
                }
            )
        return links

    @classmethod
    def build_nodes_edges(cls, url_list):
        nodes, edges = [
            cls.get_core_node(title=url_object.title, year=url_object.year, name=url_object.name)
            for url_object in url_list
        ], []
        for url_object in url_list:
            nodes += cls.build_reference_nodes(url_object)
            edges += cls.build_citation_edges(url_object)

        ## remove duplicated nodes
        exist_nodes = set()
        unique_nodes = []
        for n in nodes:
            if n["id"] not in exist_nodes:
                unique_nodes.append(n)
                exist_nodes.add(n["id"])

        nodes_pool = set()
        for e in edges:
            nodes_pool.add(e["source"])
            nodes_pool.add(e["target"])

        nodes = [x for x in unique_nodes if x["id"] in nodes_pool]
        return nodes, edges

if __name__ == '__main__':
    from ParserConfig import DIRECTORY, OUTPUT_FILES
    from ArXivURL import ArXivURL

    url_list = []
    for output_file in OUTPUT_FILES:
        url_list.append(ArXivURL.json_load(f"{DIRECTORY}/{output_file}"))

    t = TangledTreeBuilder(url_list)
    t.json_dump("complete_tree.json")