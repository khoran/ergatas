var tagWhitelist_ = [
    'B',
    'BODY',
    'BR',
    'DIV',
    'EM',
    'HR',
    'I',
    'P',
    'SPAN',
    'STRONG',
    'UL',
    'OL',
    'LI',
    'DEL',
    'SUB','SUP',
    'STRONG',
    'H1', 'H2','H3','H4','H5',
];

var attributeWhitelist_ = [
    'style',
];

function sanitizeHtml(input) {
    var iframe = document.createElement('iframe');
    if (iframe['sandbox'] === undefined) {
        alert('Your browser does not support sandboxed iframes. Please upgrade to a modern browser.');
        return '';
    }
    iframe['sandbox'] = 'allow-same-origin';
    iframe.style.display = 'none';
    document.body.appendChild(iframe); // necessary so the iframe contains a document
    iframe.contentDocument.body.innerHTML = input;

    function makeSanitizedCopy(node) {
        if (node.nodeType == Node.TEXT_NODE) {
        var newNode = node.cloneNode(true);
        } else if (node.nodeType == Node.ELEMENT_NODE && tagWhitelist_.indexOf(node.tagName) !== -1) {
            newNode = iframe.contentDocument.createElement(node.tagName);
            for (var i = 0; i < node.attributes.length; i++) {
                var attr = node.attributes[i];
                if (attributeWhitelist_.indexOf(attr.name) !== -1) {
                    newNode.setAttribute(attr.name, attr.value);
                }
            }
            for (i = 0; i < node.childNodes.length; i++) {
                var subCopy = makeSanitizedCopy(node.childNodes[i]);
                newNode.appendChild(subCopy, false);
            }
        } else {
            newNode = document.createDocumentFragment();
        }
        return newNode;
    };

    var resultElement = makeSanitizedCopy(iframe.contentDocument.body);
    document.body.removeChild(iframe);
    return resultElement.innerHTML;
}
export {sanitizeHtml};