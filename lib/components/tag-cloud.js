import {ensureFields} from '../shared/shared-utils';

function TagCloudViewModel(params) {
  var self = this;
  ensureFields(params, ["tags","selectedKeys","keyField","nameField"]);
  self.tags = params.tags; // observable map {key: {count: number, name?: string}}
  self.selectedKeys = params.selectedKeys; // observable array of selected keys
  self.filterText = ko.observable(''); // filter text input

  self.toggleTag= function(item) {
      const key = item.key;
      const current = self.selectedKeys() || [];
      //console.log("toggling tag "+key+" current: ",current);
      const index = current.indexOf(key);
      if (index > -1) {
          current.splice(index, 1);
      } else {
          current.push(key);
      }
      self.selectedKeys(current);
  };
        


  self.tagItems = ko.computed(function() {
    var tags = ko.unwrap(self.tags);
    //console.log("tags for tag cloud: ", tags);
    if (!tags || typeof tags !== 'object') return [];
    var counts = tags.map(tag => tag.count || 0);
    var minCount = Math.min(...counts);
    var maxCount = Math.max(...counts);
    var minSize = 12;
    var maxSize = 24;
    var items = tags.map(tag => {
      var count = tag.count || 0;
      var fontSize = minSize;
      if (maxCount > minCount) {
        fontSize = minSize + (count - minCount) / (maxCount - minCount) * (maxSize - minSize);
      }
      const key = tag[params.keyField];
      return {
        key: key,
        name: `${tag[params.nameField]} (${count})`,
        fontSize: fontSize,
      };
    });
    //sort items by name field
    items.sort((a, b) => a.name.localeCompare(b.name));  
    //console.log("tag cloud items: ", items);
    return items;
  });

  self.filteredTagItems = ko.computed(function() {
    var items = self.tagItems();
    var filter = self.filterText().toLowerCase().trim();
    if (!filter) return items;
    return items.filter(item => item.name.toLowerCase().includes(filter));
  });
  self.clearFilter = function() {
    self.filterText('');
  };
}

export function register(){
  ko.components.register('tag-cloud', {
    viewModel: TagCloudViewModel,
    template: require('./tag-cloud.html')
  });
}