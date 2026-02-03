
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import _ from "https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm";

var ACTIVE_NODE = null;
var NODES_INDEX = null;

$( document ).ready(function() {
    d3.json("research_paper_parser/complete_tree.json").then(data => {
       const svgString = renderD3Chart(data);
       $("#tree_container").html(svgString);

        const svg = d3.select("#tangle-svg");
        const container = svg.select(".view-container");
        const zoom = d3.zoom()
            .scaleExtent([0.1, 5]) // [minZoom, maxZoom]
            .filter((event) => {         
              if (event.type === 'mousedown') {
                  return event.button === 2; // Only allow right-click to start a drag
              }
              return !event.ctrlKey && !event.button; // disable button === 0 (left-click)
            })
            .on("zoom", (event) => { // This moves and scales the <g> element
                container.attr("transform", event.transform);
            });
        svg.call(zoom)
            .on("dblclick.zoom", null);
        svg.call(
          zoom.transform,
          d3.zoomIdentity.scale(2)
        );
        svg.on("contextmenu", (event) => {
            event.preventDefault();
        });


        d3.selectAll(".node-group")
          .on("click", function(event) {
              event.stopPropagation();
              const node_id = d3.select(this).attr("data-id")
              node_click(node_id);
          });

        node_click("2025-a_tutorial_on_llm_reasoning:_relevant_methods_behind_chatgpt_o1");    
    });

    $("#side_bar").on("click", "li.cite_bullet", function() {
        node_click($(this).attr("cite_id"), $(this).attr("source_id"));
    });
    $("#side_bar").on("click", ".back_link", function() {
        node_click($(this).attr("back_id"));
    });

    
});


const background_color = "#ffffff";
const color = d3.scaleOrdinal(d3.schemeDark2);

function node_click(node_id, from_node_id) {
    console.log("You are on: " + node_id);

    toggle_side_bar(node_id);

    const node = NODES_INDEX[node_id];

    var side_bar = $("#side_bar_template").clone().removeAttr("id");

    // GO-BACK button
    if (from_node_id) {
      var back_link = side_bar.find(".back_link");
      back_link.attr("back_id", from_node_id);
      back_link.find(".back_link_target").text(NODES_INDEX[from_node_id].title);
      back_link.show();
    }
    
    // basic information
    const attrs = ["year", "title"];
    attrs.forEach(a => 
      side_bar.find(".paper_" + a + " .text").text(node[a]) 
    );
    const referenced_by_html = get_referenced_by_html(node_id);
    if (referenced_by_html)side_bar.find(".paper_referenced_by .content").html(referenced_by_html);
    else side_bar.find(".paper_referenced_by").hide();

    // Get details from individual json file
    const json_id = node.name? node.id:node.parents[0]["id"];
    $.getJSON("research_paper_parser/paper_json/" + json_id + ".json", function( data ) {

        var authors, standard_url, summary;

        // the current node is a Core Paper 
        if (node.name) {
          side_bar.find(".paper_name").text(node["name"])
          side_bar.find(".paper_preview .content").html(data["preview"] || 'NOT AVAILABLE');

          const grouped_citations = group_citations(data.citations);
          const citation_html = get_citation_html(grouped_citations, data.sections, data.references, node.id);

          side_bar.find(".paper_citations .content").html(citation_html);
          authors = data["authors"] || '';
          standard_url = data["standard_url"] || 'N/A';
          summary = data["summary"] || 'NOT AVAILABLE';

        } else { // the current node only appears as References
          $.each(data["references"], function(key, ref_obj) {
            if (ref_obj["id"] == node_id) {

              side_bar.find(".paper_publication .label_text").text("Publication: ");
              side_bar.find(".paper_publication .text").text(ref_obj["publication"] || 'N/A');

              side_bar.find(".paper_preview").hide();
              side_bar.find(".paper_citations").hide();


              authors = ref_obj["authors"] || '';
              standard_url = ref_obj["standard_url"] || 'N/A';
              summary = ref_obj["summary"] || 'NOT AVAILABLE';
            }
          });
        }
        
        side_bar.find(".paper_authors .text").text(authors) 
        side_bar.find(".paper_url .text").html(
          '<a href="' + standard_url + '" target="_blank">' + standard_url + '</a>'
        );
        side_bar.find(".paper_url .pdf").html(
          '[<a href="' + standard_url.replace("/abs/", "/pdf/") + '" target="_blank" style="font-weight:bold">View PDF</a>]' 
        )
        side_bar.find(".paper_summary .content").html(summary);

        side_bar.show();
        $("#side_bar").html(side_bar.html());
    });

  }

function get_citation_html(grouped, sections, references, node_id) {
  let htmlString = "<ul>";
  for (let sectionId in grouped) {
      if (!(sectionId in sections)) {
            continue; 
      }

      htmlString += `<li><strong>${sections[sectionId]}</strong></li>`;
      htmlString += "<ul>";

      for (let sentence in grouped[sectionId]) {
          if (sentence == 'null') continue;
          htmlString += `<li style='font-family:"Noto Serif", "Noto Serif Fallback", serif;'>“... ${sentence} ...”</li>`;
          htmlString += "<ul>";

          grouped[sectionId][sentence].forEach(enumVal => {
              htmlString += `<li class="cite_bullet" source_id="${node_id}" cite_id="${references[enumVal]['id']}">
                ${enumVal}: [${references[enumVal]["year"]}] ${references[enumVal]["title"]}
              </li>`;
          });

          htmlString += "</ul>";
      }
      htmlString += "</ul>";
  }
  htmlString += "</ul>";
  return htmlString;
}

function group_citations(citations) {
  var grouped = {};

  citations.forEach(item => {
      if (!grouped[item.section_id]) {
          grouped[item.section_id] = {};
      }
      if (!grouped[item.section_id][item.sentence]) {
          grouped[item.section_id][item.sentence] = [];
      }
      if (!grouped[item.section_id][item.sentence].includes(item.cite_enum)) {
          grouped[item.section_id][item.sentence].push(item.cite_enum);
      }
  });
  return grouped;
}

function get_referenced_by_html(node_id) {
  if (NODES_INDEX[node_id].parents.length == 0) return ''
  let htmlString = "<ul>";
  var sentences; 
  NODES_INDEX[node_id].parents.forEach((parent, idx) => {
      htmlString += `<li class="cite_bullet" source_id="${node_id}" cite_id="${parent.id}">
        [${NODES_INDEX[parent.id].year}] ${NODES_INDEX[parent.id].title}</strong>
      </li>`;
      sentences = NODES_INDEX[node_id].sentences[idx];
      if (sentences.length > 0) {
        htmlString += `<ul>`
        sentences.forEach( s => {
          if (s) htmlString += `<li class="cite_sentence">“... ${s} ...”</li>`;
        });
        htmlString += `</ul>`
      }
  });
  htmlString += "</ul>";
  return htmlString;
}

function toggle_side_bar(node_id) {
    const tree = $("#tree_container");
    const side_bar = $("#side_bar");

    if (!ACTIVE_NODE) {
      tree.removeClass("col-xs-12").addClass("col-xs-8");
      
      side_bar.show();
      ACTIVE_NODE = node_id;
    } else if (ACTIVE_NODE == node_id) {
      tree.removeClass("col-xs-8").addClass("col-xs-12");                
      
      side_bar.hide();
      ACTIVE_NODE = null;
    } else {
      ACTIVE_NODE = node_id;
    }
}


///////////////////////////////////////////////////////////////////////////////////
/* Modified from: https://observablehq.com/@nitaku/tangled-tree-visualization-ii */

function renderD3Chart(data, options={}) {
  options.color ||= (d, i) => color(i)
  
  const tangleLayout = constructD3TangleLayout(_.cloneDeep(data), options);
  NODES_INDEX = tangleLayout.nodes_index;

  return `<svg
    id="tangle-svg"
    width="100%" height="${tangleLayout.layout.height}" 
    viewBox="0 0 ${tangleLayout.layout.width} ${tangleLayout.layout.height}"
    preserveAspectRatio="xMinYMin meet"
    style="
      background-color: ${background_color}; 
      max-width: 100%; height: auto;
    "
  >
    <style>
      text {
        font-family: sans-serif;
        font-size: 10px;
      }
      .node {
        stroke-linecap: round;
      }
      .link {
        fill: none;
      }

      .node-group .node {
          transition: stroke-width 0.2s ease, filter 0.2s ease, stroke 0.2s ease;
      }
      .node-group text {
          transition: fill 0.2s ease, font-size 0.2s ease;
      }
      .node-group:hover .node {
          stroke-width: 12px; /* Makes the vertical bar thicker */
          filter: drop-shadow(0 0 .5px rgba(0, 0, 0, 0.5)); /* Adds a soft glow */
          stroke: #333; /* Darkens the stroke for better contrast */
      }
      .node-group:hover text {
          text-decoration: underline;
          filter: brightness(1.5);    /* Make the color "pop" */
      }
    </style>

    <g class="view-container">
    
      <text x=20 y=30 style="fill:grey;font-weight:500;pointer-events:none;">
        [Right-click] to move; [Mouse-wheel] to zoom
      </text>

      ${tangleLayout.bundles.map((b, i) => {
        let d = b.links
          .map(
            l => `
          M${l.xt} ${l.yt}
          L${l.xb - l.c1} ${l.yt}
          A${l.c1} ${l.c1} 90 0 1 ${l.xb} ${l.yt + l.c1}
          L${l.xb} ${l.ys - l.c2}
          A${l.c2} ${l.c2} 90 0 0 ${l.xb + l.c2} ${l.ys}
          L${l.xs} ${l.ys}`
          )
          .join("");
        return `
          <path class="link" d="${d}" stroke="${background_color}" stroke-width="5"/>
          <path class="link" d="${d}" stroke="${options.color(b, i)}" stroke-width="2"/>
        `;
      })}

      ${tangleLayout.nodes.map(n => {
          const displayText = `[${n.year}] ${n.name ? n.name : n.title}`;
          let addlText = ` (${n.title})`;

          let textColor = "black";
          if (!n.name && n.bundle && n.bundles.length > 0) {
              const bundle = n.bundles[0][0];
              if (bundle) {
                textColor = options.color(bundle, bundle.i)
              }
          }
          if (!n.name) addlText = ``;

          const fontSize = n.name ? "12px" : "10px";
          const fontWeight = n.name ? "bold" : "normal";

          return `
          <g class="selectable node-group" data-id="${n.id}">
                <path class="selectable node" data-id="${n.id}" stroke="black" stroke-width="8" 
                      d="M${n.x} ${n.y - n.height / 2} L${n.x} ${n.y + n.height / 2}"/>
                
                <path class="node" stroke="white" stroke-width="4" 
                      d="M${n.x} ${n.y - n.height / 2} L${n.x} ${n.y + n.height / 2}"/>

                <text class="selectable" data-id="${n.id}" x="${n.x + 4}" y="${n.y - n.height / 2 - 4}" 
                      stroke="${background_color}" stroke-width="3" 
                      style="font-size: ${fontSize}; font-weight: ${fontWeight};">
                  ${displayText}
                </text>

                <text x="${n.x + 4}" y="${n.y - n.height / 2 - 4}" 
                      style="fill: ${textColor};
                             font-size: ${fontSize}; font-weight: ${fontWeight};">
                  ${displayText}${addlText}
                </text>
                <rect x="${n.x - 15}" y="${n.y - n.height}" 
                      width="200" height="${n.height * 2}" 
                      fill="transparent" style="cursor: pointer; pointer-events: all;"/>
          </g>
        `;
      })}

    </g>
  </svg>`;
}

function constructD3TangleLayout(levels, options={}){
  // precompute level depth
  levels.forEach((l, i) => l.forEach(n => (n.level = i)));

  // get NODES
  var nodes = levels.reduce((a, x) => a.concat(x), []);
  var nodes_index = {};
  nodes.forEach(d => (nodes_index[d.id] = d));
  nodes.forEach(d => {

  var parentIds = [];
  var sentences = [];
    if (d.parents !== undefined) {
      parentIds = Array.isArray(d.parents) ? d.parents : Object.keys(d.parents);
      sentences = Object.values(d.parents)
    }
    d.parents = parentIds.map(p => nodes_index[p]);
    d.sentences = sentences;
  });

  // precompute bundles
  levels.forEach((l, i) => {
    var index = {};
    l.forEach(n => {
      if (n.parents.length == 0) {
        return;
      }

      var id = n.parents
        .map(d => d.id)
        .sort()
        .join('-X-');
      if (id in index) {
        index[id].parents = index[id].parents.concat(n.parents);
      } else {
        index[id] = { id: id, parents: n.parents.slice(), level: i, span: i - d3.min(n.parents, p => p.level) };
      }
      n.bundle = index[id];
    });
    l.bundles = Object.keys(index).map(k => index[k]);
    l.bundles.forEach((b, i) => (b.i = i));
  });

  var links = [];
  nodes.forEach(d => {
    d.parents.forEach(p =>
      links.push({ source: d, bundle: d.bundle, target: p })
    );
  });

  var bundles = levels.reduce((a, x) => a.concat(x.bundles), []);

  // reverse pointer from parent to bundles
  bundles.forEach(b =>
    b.parents.forEach(p => {
      if (p.bundles_index === undefined) {
        p.bundles_index = {};
      }
      if (!(b.id in p.bundles_index)) {
        p.bundles_index[b.id] = [];
      }
      p.bundles_index[b.id].push(b);
    })
  );

  nodes.forEach(n => {
    if (n.bundles_index !== undefined) {
      n.bundles = Object.keys(n.bundles_index).map(k => n.bundles_index[k]);
    } else {
      n.bundles_index = {};
      n.bundles = [];
    }
    n.bundles.sort((a,b) => d3.descending(d3.max(a, d => d.span), d3.max(b, d => d.span)))
    n.bundles.forEach((b, i) => (b.i = i));
  });

  links.forEach(l => {
    if (l.bundle.links === undefined) {
      l.bundle.links = [];
    }
    l.bundle.links.push(l);
  });

  const node_width = 70;     // Horizontal space.
  const node_height = 45;     // Vertical space between nodes.
  const padding = 50;        // Margin around the graph so text isn't cut at the edges
  const bundle_width = 50; //15
  const level_y_padding = 16;
  const metro_d = 4;
  const min_family_height = 22;
  
  options.c ||= 16;
  const c = options.c;
  options.bigc ||= node_width+c;

  nodes.forEach(
    n => (n.height = (Math.max(1, n.bundles.length) - 1) * metro_d)
  );

  var x_offset = padding;
  var y_offset = padding;
  levels.forEach(l => {
    x_offset += l.bundles.length * bundle_width;
    y_offset += level_y_padding;
    l.forEach((n, i) => {
      n.x = n.level * node_width + x_offset;
      n.y = node_height + y_offset + n.height / 2;

      y_offset += node_height + n.height;
    });
  });

  var i = 0;
  levels.forEach(l => {
    l.bundles.forEach(b => {
      b.x =
        d3.max(b.parents, d => d.x) +
        node_width +
        (l.bundles.length - 1 - b.i) * bundle_width;
      b.y = i * node_height;
    });
    i += l.length;
  });

  links.forEach(l => {
    l.xt = l.target.x;
    l.yt =
      l.target.y +
      l.target.bundles_index[l.bundle.id].i * metro_d -
      (l.target.bundles.length * metro_d) / 2 +
      metro_d / 2;
    l.xb = l.bundle.x;
    l.yb = l.bundle.y;
    l.xs = l.source.x;
    l.ys = l.source.y;
  });
  
  // compress vertical space
  var y_negative_offset = 0;
  levels.forEach(l => {
    y_negative_offset +=
      -min_family_height +
        d3.min(l.bundles, b =>
          d3.min(b.links, link => link.ys - 2*c - (link.yt + c))
        ) || 0;
    l.forEach(n => (n.y -= y_negative_offset));
  });

  // ugly, but it works
  links.forEach(l => {
    l.yt =
      l.target.y +
      l.target.bundles_index[l.bundle.id].i * metro_d -
      (l.target.bundles.length * metro_d) / 2 +
      metro_d / 2;
    l.ys = l.source.y;
    l.c1 = l.source.level - l.target.level > 1 ? Math.min(options.bigc, l.xb-l.xt, l.yb-l.yt)-c : c;
    l.c2 = c;
  });

  var layout = {
    width: d3.max(nodes, n => n.x) + node_width + 5 * padding,
    height: d3.max(nodes, n => n.y) + node_height / 2 + 2 * padding,
    node_height,
    node_width,
    bundle_width,
    level_y_padding,
    metro_d
  };

  return { levels, nodes, nodes_index, links, bundles, layout };
}





