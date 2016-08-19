(function (pie) {

  function LegacyComponentLayer(el, bridge) {

    var updateMode = function (mode) {
      console.log('updateMode...', mode);
      if(mode === 'gather'){
        //TODO - do we need this?
        //bridge.reset();
      }
      bridge.setMode(mode);
      bridge.editable(mode === 'gather');
      el.__scope.$digest();
    };

    bridge.answerChangedHandler(function (answers) {
      if (el.__session) {
        var session = bridge.getSession();
        el.__session.answers = session.answers;
      }
    });

    function setDataAndSession() {
      if (el.__session && el.__question) {
        var dataAndSession = {
          data: el.__question,
          session: el.__session
        }
        console.log('.. setting dataAndSession on legacy componenent');
        bridge.setDataAndSession(dataAndSession);
        el.__scope.$digest();
      }
    }

    function defineProperty(name, onSet){
      var key = '__' + name;
      Object.defineProperty(el, name, {
        get: function () {
          return this[key];
        },
        set: function (e) {
          this[key] = e;
          if (this.__scope && onSet) {
            onSet.bind(this)(e);
          }
        }
      });
    }

    defineProperty('env', function(env){
      updateMode(env.mode);
    });

    defineProperty('question', function(){
      setDataAndSession();
    });

    defineProperty('outcome', function(outcome){
      bridge.setResponse(outcome);
      this.__scope.$digest();
    });

    defineProperty('session', function(){
      setDataAndSession();
    });
  }

  var el = angular.element;

  function loadScope(element) {
    return el(element).isolateScope() || el(element).scope();
  }

  function setNgProperty(scope, key, data) {
    scope[key] = data;
    scope.$digest();
  }

  function configureNgModule($provide) {

    var element = this;
    /**
     * Decorate the rootScope so that we can propogate $emits from the directive scope,
     * out of the angular context (needed to support legacy components).
     */
    function decorateRootScope($log, $delegate) {

      console.log('decorateRootScope ->...');
      var scopePrototype = ('getPrototypeOf' in Object) ?
        Object.getPrototypeOf($delegate) : $delegate.__proto__; //jshint ignore:line

      var _new = scopePrototype.$new;
      scopePrototype.$new = function () {
        var child = _new.apply(this, arguments);
        console.log('custom $new !!', child.$id);
        child.isCustomScope = true;
        var _emit = child.$emit;
        child.$emit = function () {

          //if the scope is the ui-components scope - send the events out of ng
          if (loadScope(element) === this) {
            var eventType = Array.prototype.shift.call(arguments);
            var args = Array.prototype.slice.call(arguments);
            console.log('custom $emit - eventType: ', eventType);
            var event = new CustomEvent(eventType, { bubbles: true, detail: args });
            element.dispatchEvent(event);
          } else {
            _emit.apply(this, arguments);
          }
        };
        return child;
      };

      return $delegate;
    }

    $provide.decorator('$rootScope', ['$log', '$delegate', decorateRootScope]);
  }

  var registeredElements = [];


  function CorespringLegacy(){

    var constants = {};

    //Ng-like constant api
    this.constant = function(key, value) {
      constants[key]  = value;
      return this;
    };

    this.supportsElement = function(elementName){
      return registeredElements.indexOf(elementName) !== -1;
    };

    this.processing =  {
      /** Map a pie.createOutcome call to the legacy component */
      createOutcome: function(mod, question, session, settings){
        response = session.answers;
        settings = {
          showFeedback: true,
          highlightCorrectResponse: true,
          highlightUserResponse: true
        };

        var outcome = mod.createOutcome(question, response, settings);
        return outcome;
      }
    };

    this.definePrototype = function (elementName, moduleName) {

      moduleName = moduleName || elementName;

      var elementPrototype = Object.create(HTMLElement.prototype);

      elementPrototype.angularModuleName = moduleName;

      function onRegisterComponent(event) {
        var id = event.detail[0];
        var bridge = event.detail[1];
        var element = event.detail[2];
        console.log('[registerComponent]', this, id, bridge, element);
        this.__legacyComponentLayer = new LegacyComponentLayer(this, bridge);
      };

      function create() {
        var mod = angular.module(this.angularModuleName)
          .config(['$provide', configureNgModule.bind(this)]);

        for(var k in constants){
          console.log('adding constant: ', k);
          mod.constant(k, constants[k]);
        }

        //legacy component support...
        this.addEventListener('registerComponent', onRegisterComponent);

        angular.bootstrap(this, [this.angularModuleName]);
        this.__scope = loadScope(this);
      }

      elementPrototype.createdCallback = function () {
        console.log('created!', this, arguments);
        create.bind(this)();
      };

      registeredElements.push(elementName);
      return elementPrototype;
    };

  }


  pie.addFramework('corespring-legacy', new CorespringLegacy());

})(pie);