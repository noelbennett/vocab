/********************************************************************************************************************
 * UTILS
 ********************************************************************************************************************/

Utils =
{
  /**
   * Options Filter - Filters and validates a set of options according to given rules.  This is so you if you typo
   * an option or neglect to define a rule for it it'll bust right away with an exception.
   *
   * @param options  - an object (hash) of the options.
   * @param defaults - an object (hash) of rules // TODO comment the lexicon
   * @returns function(string key) - a function used to access an option
   */
  optionsFilter : function(originalOptions, rules)
  {
    originalOptions = _.clone(originalOptions);
    var options = {};

    // validate and apply defaults
    _.each(rules, function(rule, key) {
      var isSet = _.has(originalOptions, key);
      if (isSet) {
        options[key] = originalOptions[key];
        delete originalOptions[key];
      }

      if (rule === 'required') {
        if (!isSet) { throw new Error(Utils.sprintf('`%s` is missing', key)); }
      } else {
        throw new Error(Utils.sprintf('invalid rule `%s`', rule));
      }
    });

    // check for superfluous options
    if (!_.isEmpty(originalOptions)) {
      throw new Error(Utils.sprintf('attempting to set invalid option(s): `%s`', _.keys(originalOptions).join('`, `')));
    }

    // method to access option
    return function(key)
    {
      if (!_.has(options, key)) {
        throw new Error(Utils.sprintf('attempting to retrieve invalid option: `%s`', key));
      }
      return options[key];
    };
  },

  /**
   * sprintf - you already know what it is... except it only accepts %s right now
   */
  sprintf : function(format /* varargs */)
  {
    var argIndex = 1;
    var _arguments = arguments;

    return format.replace(/%([%s])/, function(fullMatch, captured) {
      switch (captured) { case 's' : return _arguments[argIndex++];
                          default  : return fullMatch; }
    });
  }
};


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
 * CONTROL/VIEW MODULES
 ********************************************************************************************************************/

/**
 * Abstract control module
 */
var ControlModule = function() {};

ControlModule.prototype =
{
  /**
   * Creates a `this.dom` object containing jquery objects
   *
   * @param selectors - an object the keys of which being the keys in this.dom, the values being jquery selectors
   * @returns void
   */
  _createDomReferences : function(selectors)
  {
    var _this = this;

    this.dom = {};
    _.each(selectors, function(selector, key) {
      _this.dom[key] = $(selector);
    });
  },

  /**
   * Binds handles to dom objects set up in _createDomReferences().
   *
   * @param handlers - a hash the keys being the keys of the dom item, the values being a hash itself with keys
   *                   being the event types and values being the function
   * @returns void
   */
  _bindDomEventHandlers : function(handlers)
  {
    var _this = this;

    _.each(handlers, function(handlerSet, key) {
      if (!_.has(_this.dom, key)) {
        throw new Error(Utils.sprintf('no DOM reference for `%s`', key));
      }

      _.each(handlerSet, function(handler, event) {
        _this.dom[key].bind(event, _.bind(handler, _this));
      });
    });
  },

  /**
   * Absorbs an options applying validation and defaults
   *
   * @param opts  - an object containing the options
   * @param rules - keys correspond to keys in the object, rules include:
   *    "default"  - this will be the default option if the item is unset
   */
  _absorbOpts : function(opts, rules)
  {
    this.getOpt = Utils.optionsFilter(opts, rules);
  }
};

/**
 * Messages module
 */
var MessagesModule = function()
{
  this._createDomReferences({
    message : '#message'
  });
};

_.extend(MessagesModule.prototype, ControlModule.prototype,
{
  /**
   * Sets the progress message
   */
  setMessage : function(msg)
  {
    this.dom.message.text(msg);
  },
});


/**
 * Dictonary module
 */
var DictionaryModule = function(opts)
{
  this._absorbOpts(opts, {
    data     : 'required',
    messages : 'required',
    onAdd    : 'required'
  });

  this._createDomReferences({
    formItem         : '#form',
    wordInput        : '#form input[name=word]',
    translationInput : '#form input[name=translation]',
    addButton        : '#form button.add',
    deleteButtons    : 'ul button.delete'
  });

  this._bindDomEventHandlers({
    addButton     : { click : this.add },
    deleteButtons : { click : this.delete },
    wordInput        : { change : this.refresh,
                         keyup  : this.refresh },
    translationInput : { change   : this.enableAdd,
                         keyup    : this.enableAdd,
                         keypress : this.submitOnEnter }
  });

  this.dom.deleteButtons.attr('tabindex', -1);
  this.dom.addButton.attr('tabindex', -1);
};

_.extend(DictionaryModule.prototype, ControlModule.prototype,
{
  /**
   * Adds new word to the dictionary
   */
  add : function(e)
  {
    var _this = this;

    if (e) { e.preventDefault(); }
    var obj = {
      word        : this.dom.wordInput.val(),
      translation : this.dom.translationInput.val()
    };

    this.getOpt('messages').setMessage('adding item'); 

    $.when(
      this.getOpt('data').add(obj)
      // TODO: recent item
    ).then(function() { _this.getOpt('messages').setMessage('all changes saved'); },
           function() { _this.getOpt('messages').setMessage('failed to save changes'); });

    this.getOpt('onAdd')(obj);
    this.refresh();

    this.dom.wordInput.trigger('focus').select();
  },

  /**
   * delete
   */
  delete : function(e)
  {
    e.preventDefault();

    var li = $(e.target).parents('li').first();
    var word = li.find('p:eq(0)').text();

    if (!confirm(Utils.sprintf('Are you sure you want to delete "%s"?', word))) {
      return;
    }

    this.getOpt('messages').setMessage('deleting item');

    var _this = this;
    this.getOpt('data').delete(word).then(
      function() { _this.getOpt('messages').setMessage('all changes saved'); },
      function() { _this.getOpt('messages').setMessage('failed to save changes'); });

    this.refresh();
  },

  /**
   * Shows words similar to what is being typed in
   */
  refresh : function(e)
  {
    var word = this.dom.wordInput.val();

    var data = this.getOpt('data').data;

    var found = _.findWhere(data, { 'word' : word });
    if (found) {
      this.dom.translationInput.val(found.translation).attr('disabled', 'disabled');
    } else {
      this.dom.translationInput.val('').removeAttr('disabled');
    }
    this.dom.addButton.hide();

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
    for (li = this.dom.formItem.next(); li.length; li = li.next()) { populateLi(li, i++); }

    // walk backwards from the form item populating matches
    var i = insertIndex - 1;
    for (li = this.dom.formItem.prev(); li.length; li = li.prev()) { populateLi(li, i--); }
  },

  /**
   * Enable add button if there is translation text
   */
  enableAdd : function(e)
  {
    this.dom.translationInput.val().length && this.dom.addButton.show() || this.dom.addButton.hide();
  },

  /**
   * Handles keyup and adds item on ENTER
   */
  submitOnEnter : function(e)
  {
    if (e.which === 0x0D) {
      this.add();
    }
  }

});


/**
 * Recent items module
 */
var RecentItemsModule = function(opts)
{
  this._absorbOpts(opts, {
    data : 'required'
  });

  this._createDomReferences({
    'list' : 'div.recent > ul'
  });
};

_.extend(RecentItemsModule.prototype, ControlModule.prototype, {

  /**
   * Refreshes recent items
   */
  refresh : function()
  {
    this.dom.list.empty();

    for (var i = 0; i < this.getOpt('data').data.length; i++) {
      var li = $('<li><p></p><p></p></li>');
      li.find('p:eq(0)').text(this.getOpt('data').data[i].word);
      li.find('p:eq(1)').text(this.getOpt('data').data[i].translation);
      this.dom.list.append(li);
    }
  }
});


/********************************************************************************************************************
 * APPLICATION
 ********************************************************************************************************************/

var App = {

  /**
   * Set up app
   */
  start : function()
  {

    //
    // create view modules
    //
    var messagesModule = new MessagesModule();

    var recentItemsModule = new RecentItemsModule({
      data : Data.recentItems
    });

    var dictionaryModule = new DictionaryModule({
      data     : Data.dictionary,
      messages : messagesModule,
      onAdd    : function(item) {
        Data.recentItems.add(item);
        recentItemsModule.refresh();
      }
    });


    //
    // load data
    //
    messagesModule.setMessage('Loading data');

    $.when(
      Data.dictionary.load(),
      Data.recentItems.load()
    ).then(function() {
      messagesModule.setMessage('ready');
      dictionaryModule.refresh();
      recentItemsModule.refresh();
    });
  }
};

$(App.start);
