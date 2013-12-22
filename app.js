/********************************************************************************************************************
 * MODEL LAYER
 ********************************************************************************************************************/

/**
 * AbstractDataSet - manages all data for a domain
 */
var AbstractDataSet = function() {};
AbstractDataSet.prototype = {

  data : null,
  url  : null, // abstract

  /**
   * parse - Handle data from server.  Default is just to use the data as returned.
   */
  parse : function(data) { return data; },

  /**
   * load - Load all the data.
   *
   * @returns promise
   */
  load : function() 
  {
    var _this = this;
    var ready = new $.Deferred();

    $.ajax({
      url      : this.url,
      datatype : 'json',
      success  : function(resp) {
        _this.data = _this.parse(resp);
        ready.resolve(resp);
      },
      error : function(xhr) {
        if (xhr.status == 404) { // It's a "RESTy" 404 ...so there's no data there yet.
          _this.data = _this.parse([]);
          ready.resolve([]);
        } else {
          ready.reject();
        }
      }
    });

    return ready.promise();
  },

  /**
   * write - Writes all the data.
   *
   * @returns promise
   */
  write : function()
  {
    return $.ajax({
      url  : this.url,
      type : 'PUT',
      data : JSON.stringify(this.data),
    }).promise();
  }
};


/**
 * Dictonary
 */
var DictionaryDataSet = function() {};
_.extend(DictionaryDataSet.prototype, AbstractDataSet.prototype, {
  
  url : '/data/vocab/dictionary',

  /**
   * parse - Sorts the data by word.
   */
  parse : function(data) { return _.sortBy(data, 'word'); },

  /**
   * add - Inserts the data in the right place and persists.
   */
  add : function(item)
  {
    var index = _.sortedIndex(this.data, item, 'word');
    if (index < this.data.length && this.data[index].word === item.word) { // don't add word if it already exists
      return (new $.Deferred()).reject().promise(); // TODO: return info on why it failed
    }
    this.data.splice(index, 0, item);
    return this.write();
  },

  /**
   * delete - Removes item from set.
   *
   * @param string word - word  to delete
   */
  delete : function(word)
  {
    var index = _.sortedIndex(this.data, { word : word }, 'word');

    if (this.data[index].word !== word) { // couldn't find item (shouldn't happen)
      return (new $.Deferrered()).reject().promise(); // TODO: return info on why it failed
    }

    this.data.splice(index, 1);
    return this.write();
  }
});


/**
 * RecentItems
 */
var MAX_RECENT_ITEMS = 12;

var RecentItemsDataSet = function() {};
_.extend(RecentItemsDataSet.prototype, AbstractDataSet.prototype, {

  url : '/data/vocab/recent',

  /**
   * add - Adds item and truncates list to max length
   */
  add : function(item)
  {
    this.data.unshift(item);
    while (this.data.length > MAX_RECENT_ITEMS) { this.data.pop(); }
    return this.write();
  }

});


/**
 * Interface
 */
var Data = {
  dictionary  : new DictionaryDataSet(),
  recentItems : new RecentItemsDataSet()
};


/********************************************************************************************************************
 * APPLICATION (VIEW/CONTROL)
 ********************************************************************************************************************/

var App = {

  /**
   * Sets header message
   */
  setMessage : function(msg)
  {
    $('#message').text(msg);
  },

  /**
   * Adds new word
   */
  add : function(e)
  {
    e.preventDefault();
    var obj = {
      word        : App.dom.word.val(),
      translation : App.dom.translation.val()
    };

    App.setMessage('adding item'); 

    $.when(
      Data.dictionary.add(obj),
      Data.recentItems.add(obj)
    ).then(function() { App.setMessage('all changes saved');
                        App.refreshView(); },
           function() { App.setMessage('failed to save changes'); });
  },

  /**
   * delete
   */
  delete : function(e)
  {
    e.preventDefault();

    var li = $(e.target).parents('li').first();
    var word = li.find('p:eq(0)').text();

    if (!confirm('Are you sure you want to delete "' + word + '"?')) {
      return;
    }

    App.setMessage('deleting item'); 

    Data.dictionary.delete(word).then(
      function() { App.setMessage('all changes saved'); },
      function() { App.setMessage('failed to save changes'); }
    );

    App.refreshView();
  },

  /**
   * Shows words similar to what is being typed in
   */
  refreshDictionary : function(e)
  {
    var word = App.dom.word.val();

    var data = Data.dictionary.data;

    var found = _.findWhere(data, { 'word' : word });
    if (found) {
      App.dom.translation.val(found.translation).attr('disabled', 'disabled');
    } else {
      App.dom.translation.val('').removeAttr('disabled');
    }
    App.dom.add.hide();

    var insertIndex = _.sortedIndex(data, { word : word }, 'word');

    var populateLi = function(li, i)
    {
      var item = (i >= 0 && i < data.length) ? data[i] : null;

      li.find('p:eq(0)').text(item ? item.word        : '-');
      li.find('p:eq(1)').text(item ? item.translation : '-');
      if (item) {
        li.find('button.delete').show();
      } else {
        li.find('button.delete').hide();
      }
    };

    var li;

    // walk forward from the form item populating matches
    i = insertIndex + (found ? 1 : 0); // skip item if it's already in the list
    for (li = App.dom.formLi.next(); li.length; li = li.next()) { populateLi(li, i++); }

    // walk backwards from the form item populating matches
    var i = insertIndex - 1;
    for (li = App.dom.formLi.prev(); li.length; li = li.prev()) { populateLi(li, i--); }
  },

  /**
   * Refreshes recent items
   */
  refreshRecent : function()
  {
    App.dom.recentUl.empty();

    for (var i = 0; i < Data.recentItems.data.length; i++) {
      var li = $('<li><p></p><p></p></li>');
      li.find('p:eq(0)').text(Data.recentItems.data[i].word);
      li.find('p:eq(1)').text(Data.recentItems.data[i].translation);
      App.dom.recentUl.append(li);
    }
  },

  /**
   * Refreshes content panes
   */
  refreshView : function()
  {
    App.refreshDictionary();
    App.refreshRecent();
  },

  /**
   * Enable add button if there is translation text
   */
  enableAdd : function()
  {
    if (App.dom.translation.val().length) {
      App.dom.add.show();
    } else {
      App.dom.add.hide();
    }
  },

  /**
   * Set up app
   */
  start : function()
  {
    //
    // load data
    //
    App.setMessage('Loading data');

    $.when(
      Data.dictionary.load(),
      Data.recentItems.load()
    ).then(function() {
      App.setMessage('ready');
      App.refreshView();
    });

    //
    // build dom references
    //
    App.dom = {
      formLi      : $('#form'),
      word        : $('#form input[name=word]'),
      translation : $('#form input[name=translation]'),
      add         : $('#form button.add'),
      deletes     : $('ul button.delete'),
      before      : $('#before'),
      after       : $('#after'),
      recentUl    : $('div.recent > ul'),
    };

    //
    // bind events
    //
    App.dom.add.bind('click',          App.add);
    App.dom.deletes.bind('click',      App.delete);
    App.dom.word.bind('change',        App.refreshView);
    App.dom.word.bind('keyup',         App.refreshView);
    App.dom.translation.bind('change', App.enableAdd);
    App.dom.translation.bind('keyup',  App.enableAdd);
  }
};

$(App.start);
