/* global vis, tinycolor, sisters, $, didYouMean */

// Mock out dependencies for testing on NodeJS. These are imported in HTML in
// the browser.
/* eslint-disable */
/* istanbul ignore else */
if (typeof sisters === 'undefined') {
  sisters = require('./relations');
}
/* istanbul ignore else */
if (typeof tinycolor === 'undefined') {
  tinycolor = require('tinycolor2');
}
/* istanbul ignore else */
if (typeof $ === 'undefined') {
  $ = require('jquery');
}
/* istanbul ignore else */
if (typeof vis === 'undefined') {
  vis = require('vis');
}
/* istanbul ignore else */
if (typeof didYouMean === 'undefined') {
  didYouMean = require('didyoumean');
}
/* eslint-enable */

var network = null;

var createNodesCalled = false;
var nodesGlobal;
var edgesGlobal;
var nodesDataSet;
var edgesDataSet;

var previousSearchFind;

var DIRECTION = {
  FORWARD: 0,
  BACKWARD: 1,
};

var KEYCODE_ENTER = 13;

var familyColorGlobal = {};
var pledgeClassColorGlobal = {};

function ColorSpinner(colorObj, spinAmount) {
  this.spinAmount = spinAmount;
  this.color = new tinycolor(colorObj);
}
ColorSpinner.prototype.spin = function () {
  this.color = this.color.spin(this.spinAmount);
  return this.color.toHexString();
};

var getNewFamilyColor = (function () {
  var spinner1 = new ColorSpinner({ h: 0, s: 0.6, v: 0.9 }, 77);
  return function () {
    return spinner1.spin();
  };
}());

var getNewPledgeClassColor = (function () {
  var spinner2 = new ColorSpinner({ h: 0, s: 0.4, v: 0.9 }, 23);
  return function () {
    return spinner2.spin();
  };
}());

/* istanbul ignore next */
/**
 * In cases where we can't find an exact match for a sisters's name, suggest
 * similar alternatives. This is only called if there is a data entry error, and
 * the purpose is to just give a hint as to how to fix the data entry issue.
 * Since this is only called for data entry bugs, and those data entry bugs
 * should not be submitted into the repo, this is currently untestable.
 */
function didYouMeanWrapper(invalidName) {
  var allValidNames = sisters.map(function (sis) {
    return sis.name;
  });
  // Find valid names which are similar to invalidName.
  var similarValidName = didYouMean(invalidName, allValidNames);
  return similarValidName;
}

function createNodes(sisters_) {
  var oldLength = sisters_.length;
  var newIdx = oldLength;

  var nodes = [];
  var edges = [];
  var familyColor = {};
  var pledgeClassColor = {};

  var familyToNode = {};
  for (var i = 0; i < oldLength; i++) {
    var sis = sisters_[i];
    sis.id = i;

    var lowerCaseFamily = (sis.familystarted || '').toLowerCase();
    if (lowerCaseFamily && !familyColor[lowerCaseFamily]) {
      if (lowerCaseFamily === "muses") {
          familyColor[lowerCaseFamily] = "#2d6a4f";  // Assign custom color for "Muses"
        } else {
          // Add a new family
          familyColor[lowerCaseFamily] = getNewFamilyColor();
        }

      // Determine if the text color should be white or black based on brightness
      var bgColor = tinycolor(familyColor[lowerCaseFamily]);
      var textColor = bgColor.isDark() ? "#ffffff" : "#000000";  


      // Create a root for that family
      var newNode = {
        id: newIdx++, // increment
        name: lowerCaseFamily,
        label: sis.familystarted,
        family: lowerCaseFamily,
        inactive: true, // a family does not count as an active undergraduate
        font: { size: 50, color: textColor }, // super-size the font
      };
      familyToNode[lowerCaseFamily] = newNode;
      nodes.push(newNode);
    }

    if (sis.big && lowerCaseFamily) {
      // This person has a big sis, but they also started a new family of their
      // own. This person gets two nodes, one underneath their big sis and
      // another underneath their new family.

      // Node underneath the big sis. This is a "fake" node: this will exist in
      // the tree, however you can't search for it and it won't have any little
      // siss.
      edges.push({ from: sis.big, to: newIdx });

      // Get the family color for this sister
      var sisterColor = familyColor[lowerCaseFamily] || "#cccccc"; // Default to grey if missing

      // Determine if the text color should be white or black based on background brightness
      var bgColor = tinycolor(sisterColor);
      var textColor = bgColor.isDark() ? "#ffffff" : "#000000";

      nodes.push(Object.assign({}, sis, {
        id: newIdx++, // increment
        name: sis.name,
        label: sis.name,
        family: lowerCaseFamily,
        shape: "box",
        color: sisterColor,  // Set background color
        font: { color: textColor },  // Apply white text for dark backgrounds
      }));

      // Node underneath the new family. This is a "real" node: just like any
      // other node, you can search for it and it will have little sis (if this
      // sister had any little sis).
      var familyNode = familyToNode[lowerCaseFamily];
      edges.push({ from: familyNode.id, to: sis.id });
    } else if (!sis.big && !lowerCaseFamily) {
      /* istanbul ignore next */
      throw new Error(
        'Encountered a little sis ('
        + sis.name
        + ') without a big sis. This is a data entry error.');
    } else if (lowerCaseFamily) {
      // This person founded a family, and has no big sis, so put his node
      // directly underneath the family node
      edges.push({ from: familyToNode[lowerCaseFamily].id, to: sis.id });
    } else {
      // This person is just a regular sister
      edges.push({ from: sis.big, to: sis.id });
    }
    sis.big = sis.big || lowerCaseFamily;

    var lowerCaseClass = (sis.pledgeclass || '').toLowerCase();
    if (lowerCaseClass && !pledgeClassColor[lowerCaseClass]) {
      // Add a new Pledge Class
      pledgeClassColor[lowerCaseClass] = getNewPledgeClassColor();
    }

    sis.label = sis.name; // Display the name in the graph

    sis.shape = "box"; // Make all nodes square
    nodes.push(sis); // Add this to the list of nodes to display
  }

  var nameToNode = {};
  // Change .big from a string to a link to the big sister node
  nodes.forEach(function (member) {
    if (member.big) {
      if (nameToNode[member.big]) {
        member.big = nameToNode[member.big];
      } else {
        nodes.forEach(function (member2) {
          if (member.big === member2.name) {
            nameToNode[member.big] = member2;
            member.big = member2;
          }
        });
      }
    }
  });

  // Fix the edges that point from strings instead of node IDs
  edges.forEach(function (edge) {
    if (typeof edge.from === 'string') {
      var name = edge.from;
      var node = nameToNode[name];
      /* istanbul ignore next */
      if (!node) {
        var correctedName = didYouMeanWrapper(name);
        var msg;
        if (!correctedName) {
          msg = 'Unable to find a match for '
            + JSON.stringify(name);
        } else if (name.trim() === correctedName.trim()) {
          msg = 'Inconsistent whitespace. Expected to find '
            + JSON.stringify(correctedName)
            + ', but actually found ' + JSON.stringify(name) + '. These should '
            + 'have consistent whitespace.';
        } else {
          msg = 'Unable to find ' + JSON.stringify(name)
            + ', did you mean ' + JSON.stringify(correctedName)
            + '?';
        }
        throw new Error(msg);
      }
      edge.from = node.id;
    }
  });

  function getFamily(node) {
    node.family = node.family || node.familystarted;
    if (node.family) return node.family;
    try {
      node.family = getFamily(node.big);
    } catch (e) {
      /* istanbul ignore next */
      node.family = 'unknown';
    }

    return node.family;
  }

  // re-process the sisters
  // Color all the nodes (according to this color scheme)
  nodes.forEach(function (node) {
    // Get the family information
    getFamily(node);

    // Mark the family as active (if it has 1 or more active members)
    if (!node.inactive && !node.graduated) {
      familyToNode[node.family.toLowerCase()].inactive = false;
    }
  });

  return [nodes, edges, familyColor, pledgeClassColor];
}

// Only call this once (for effiencency & correctness)
/* istanbul ignore next */
function createNodesHelper() {
  if (createNodesCalled) return;
  createNodesCalled = true;

  var output = createNodes(sisters);
  nodesGlobal = output[0];
  edgesGlobal = output[1];
  familyColorGlobal = output[2];
  pledgeClassColorGlobal = output[3];

  nodesDataSet = new vis.DataSet(nodesGlobal);
  edgesDataSet = new vis.DataSet(edgesGlobal);
}

function findSister(name, nodes, prevElem, direction) {
  var lowerCaseName = name.toLowerCase();
  var matches = nodes.filter(function (element) {
    return element.name.toLowerCase().includes(lowerCaseName);
  });
  if (matches.length === 0) {
    return undefined;
  }

  // throw Error(`direction is ${direction}`);
  var increment = direction === DIRECTION.FORWARD ? 1 : -1;
  var idx = 0;
  if (prevElem) {
    idx = matches.indexOf(prevElem);
    idx = (idx + increment) % matches.length;
    if (idx < 0) {
      idx = matches.length + idx;
    }
  }
  return matches[idx];
}

/**
 * Searches for the specific sister (case-insensitive, matches any substring).
 * If found, this zooms the network to focus on that sister's node.
 *
 * Returns whether or not the search succeeded. This always returns `true` for
 * an empty query.
 */
/* istanbul ignore next */
function findSisterHelper(name, direction) {
  if (!name) return true; // Don't search for an empty query.
  // This requires the network to be instantiated, which implies `nodesGlobal`
  // has been populated.
  if (!network) return false;

  var found = findSister(name, nodesGlobal, previousSearchFind, direction);
  previousSearchFind = found;

  if (found) {
    network.focus(found.id, {
      scale: 0.9,
      animation: true,
    });
    network.selectNodes([found.id]);
    return true;
  }
  return false; // Could not find a match
}

/* istanbul ignore next */
function draw() {
  createNodesHelper();

  var changeColor;
  var colorMethod = document.getElementById('layout').value;
  var legendContainer = document.getElementById('legend-container');
  var legend = document.getElementById('legend');

  // Clear existing legend content
  legendContainer.innerHTML = "";

  // Ensure legend container is only visible in pledge class mode
  if (colorMethod === 'pledgeClass') {
    legendContainer.style.display = "block"; // Show legend only for pledge class view
  } else {
    legendContainer.style.display = "none"; // Hide legend for other views
  }

  switch (colorMethod) {
    case 'active':
      changeColor = function (node) {
        let className = node.pledgeclass ? node.pledgeclass.toLowerCase() : "N/A";
        let classColor = node.pledgeclass ? (pledgeClassColorGlobal[className] || "lightgrey") : "lightgrey";
        
        // Determine text color based on background brightness
        let bgColor = tinycolor(classColor);
        let textColor = bgColor.isDark() ? "#ffffff" : "#000000";
        
        node.color = classColor;
        node.font = { color: textColor };  // Set font color dynamically
        
        nodesDataSet.update(node);
      };
      break;

      case 'pledgeClass':
        let seenClasses = new Set(); // Track unique pledge classes
        let naColor = "lightgrey";  // Default for "N/A"

        // Clear and show legend only when in Pledge Class mode
        legend.innerHTML = "";
        legendContainer.style.display = "block";

        changeColor = function (node) {
            let className = node.pledgeclass ? node.pledgeclass.toLowerCase() : "N/A";

            // Ensure each pledge class gets a unique color
            if (!pledgeClassColorGlobal[className]) {
                pledgeClassColorGlobal[className] = getNewPledgeClassColor();
            }

            let classColor = pledgeClassColorGlobal[className] || naColor;
            let bgColor = tinycolor(classColor);
            let textColor = bgColor.isDark() ? "#ffffff" : "#000000"; // White text for dark colors

            node.color = classColor; // Apply correct pledge class color
            node.font = { color: textColor }; // Apply text color dynamically
            nodesDataSet.update(node);

            // Add unique pledge class colors to the legend
            if (!seenClasses.has(className)) {
                let legendItem = document.createElement("div");
                legendItem.style.display = "flex";
                legendItem.style.alignItems = "center";
                legendItem.style.marginBottom = "5px";

                let colorBox = document.createElement("div");
                colorBox.style.width = "15px";
                colorBox.style.height = "15px";
                colorBox.style.backgroundColor = classColor;
                colorBox.style.marginRight = "10px";
                colorBox.style.border = "1px solid black";

                let labelText = document.createElement("span");
                labelText.innerText = className === "N/A" ? "N/A (Not Listed)" : node.pledgeclass;

                legendItem.appendChild(colorBox);
                legendItem.appendChild(labelText);
                legend.appendChild(legendItem);

                seenClasses.add(className);
            }
        };

        nodesGlobal.forEach(changeColor); // Apply pledge class colors
        break;

    default: // 'family'
    case 'family':
      changeColor = function (node) {
          let familyColor = familyColorGlobal[node.family.toLowerCase()];
          let bgColor = tinycolor(familyColor);
          let textColor = bgColor.isDark() ? "#ffffff" : "#000000"; // White text for dark backgrounds
  
          node.color = familyColor;
          node.font = { color: textColor }; // Update text color dynamically
          nodesDataSet.update(node);
      };
      break;
  }
  nodesGlobal.forEach(changeColor);
  if (!network) {
    // create a network
    var container = document.getElementById('mynetwork');
    var data = {
      nodes: nodesDataSet,
      edges: edgesDataSet,
    };

    var options = {
      layout: {
        hierarchical: {
          sortMethod: 'directed',
        },
      },
      edges: {
        smooth: true,
        arrows: { to: true },
      },
    };
    network = new vis.Network(container, data, options);
  } else {
    network.redraw();
  }
}

/* istanbul ignore next */
// This section is intended to only run in the browser, it does not run in
// nodejs.
if (typeof document !== 'undefined') {
  $(document).ready(function () {
    // Start the first draw
    draw();

    // Search feature
    var dropdown = document.getElementById('layout');
    dropdown.onchange = function () {
      draw();
    };
    function hidePrevNextButtons() {
      $('#prevsearch').css('display', 'none');
      $('#nextsearch').css('display', 'none');
    }
    function showPrevNextButtons() {
      $('#prevsearch').css('display', 'inline');
      $('#nextsearch').css('display', 'inline');
    }
    function search(direction) {
      if (direction !== DIRECTION.FORWARD && direction !== DIRECTION.BACKWARD) {
        console.warn('Unexpected direction value: ' + direction
          + ' (defaulting to FORWARD direction)');
        direction = DIRECTION.FORWARD;
      }
      direction = direction || DIRECTION.FORWARD;
      var query = $('#searchbox').val();
      var success = findBrotherHelper(query, direction);

      // Indicate if the search succeeded or not.
      if (success) {
        $('#searchbox').css('background-color', 'white');
        if (query !== '') {
          showPrevNextButtons();
        } else {
          hidePrevNextButtons();
        }
      } else {
        $('#searchbox').css('background-color', '#EEC4C6'); // red matching flag
        hidePrevNextButtons();
      }
    }
    document.getElementById('searchbox').onkeypress = function (e) {
      if (!e) e = window.event;
      var keyCode = e.keyCode || e.which;
      if (typeof keyCode === 'string') {
        keyCode = Number(keyCode);
      }
      if (keyCode === KEYCODE_ENTER && !e.shiftKey) {
        search(DIRECTION.FORWARD);
      }
      if (keyCode === KEYCODE_ENTER && e.shiftKey) {
        search(DIRECTION.BACKWARD);
      }
    };
    document.getElementById('searchbutton').onclick = search.bind(undefined, DIRECTION.FORWARD);
    document.getElementById('nextsearch').onclick = search.bind(undefined, DIRECTION.FORWARD);
    document.getElementById('prevsearch').onclick = search.bind(undefined, DIRECTION.BACKWARD);
  });
}

/* istanbul ignore else */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports.createNodes = createNodes;
  module.exports.createNodesHelper = createNodesHelper;
  module.exports.findBrother = findBrother;
  module.exports.DIRECTION = DIRECTION;
}
