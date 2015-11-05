(function (exports) {
  'use strict';

  var nextPromiseId = 1;

  var originalOff = exports.off;

  var root = (function () {
    var root = new URL(
      document.currentScript.dataset.root || '',
      window.location.origin
    ).href;
    return root.endsWith('/') ? root : root + '/';
  }());

  var workerURL =
    root + (document.currentScript.dataset.worker || 'offliner-worker.js');

  /**
   * The exported global `off` object contains methods for communicating with
   * the offliner worker in charge.
   *
   * @class OfflinerClient
   */
  exports.off = {

    /**
     * Callbacks for the events.
     *
     * @property _eventListeners
     * @type Object
     * @private
     */
    _eventListeners: {},

    /**
     * Implementation callbacks for cross promises by its unique id.
     *
     * @property _xpromises
     * @type Object
     * @private
     */
    _xpromises: {},

    /**
     * Call `restore()` when you want the `off` name in the global scope for
     * other purposes. The method will restore the previous contents to the
     * global variable and return the `OfflinerClient`.
     *
     * @method restore
     * @return {OfflinerClient} The current offliner client.
     */
    restore: function () {
      exports.off = originalOff;
      return this;
    },

    /**
     * Register the offliner worker. The worker will be installed with
     * root `/` [scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#Syntax)
     * unless you add the `data-root` attribute to the script tag.
     *
     * In the same way, the client will look for a script in the specified root
     * called `offliner-worker.js`. If you want to change this behaviour, use
     * the `data-worker` attribute.
     *
     * For instance, suppose your web application is running under:
     * https://delapuente.github.com/offliner
     *
     * And you have your worker at:
     * https://delapuente.github.com/offliner/worker.js
     *
     * Then the script tag should looks like:
     * ```html
     * <script src="js/offliner-client.js" data-root="offliner" data-worker="worker.js"></script>
     * ```
     *
     * @method install
     * @return {Promise} A promise resolving if the installation success.
     */
    install: function () {
      if (!('serviceWorker' in navigator)) {
        return Promise.reject(new Error('serviceworkers-not-supported'));
      }

      return navigator.serviceWorker.register(workerURL, {
        scope: root
      }).then(function (registration) {
        return this.connect().then(function () {
          return registration;
        });
      }.bind(this));
    },

    /**
     * Keeps the promise of connect.
     *
     * @property _connecting
     * @type Promise
     * @private
     */
    _connecting: null,

    /**
     * Connects the client with offliner allowing the client to control offliner
     * and receive events.
     *
     * @method connect
     * @return {Promise} A promise resolving once connection has been stablished
     * with the worker and communication is possible.
     */
    connect: function () {
      if (!this._connecting) { this._connecting = this._connect(); }
      return this._connecting;
    },

    /**
     * The actual implementation for {{#crossLink "connect:method"}}{{/crossLink}}
     *
     * @method _connect
     * @return {Promise} A promise resolving once connection has been stablished
     * with the worker and communication is possible.
     * @private
     */
    _connect: function () {
      if (!('serviceWorker' in navigator)) {
        return Promise.reject(new Error('serviceworkers-not-supported'));
      }

      var installMessageHandlers = this._installMessageHandlers.bind(this);
      var checkForActivationPending = this._checkForActivationPending.bind(this);
      return new Promise(function (fulfill, reject) {
        navigator.serviceWorker.getRegistration(root).then(function (registration) {
          if (registration.active) {
            installMessageHandlers();
            checkForActivationPending();
            return fulfill();
          }

          var installingWorker = registration.installing;
          if (!installingWorker) {
            return reject(new Error('impossible-to-connect'));
          }

          installingWorker.onstatechange = function () {
            if (installingWorker.state === 'installed') {
              installMessageHandlers();
              checkForActivationPending();
              fulfill();
            }
          };
        });
      });
    },

    /**
     * Attaches a listener for a type of event.
     *
     * @method on
     * @param type {String} The type of the event.
     * @param handler {Callback} The callback receiving the event.
     * @param willBeThis {Object} The context object `this` for the `handler`.
     */
    on: function (type, handler, willBeThis) {
      if (!this._has(type, handler, willBeThis)) {
        this._eventListeners[type] = this._eventListeners[type] || [];
        this._eventListeners[type].push([handler, willBeThis]);
      }
    },

    /**
     * Request an update to offliner.
     *
     * @method update
     * @return {Promise} If the update process is successful, the promise will
     * resolve to a new version and an
     * {{#crossLink "OfflinerClient/activationPending:event"}}{{/crossLink}}
     * will be triggered. If the update is not needed, the promise will be
     * rejected with `no-update-needed` reason.
     */
    update: function () {
      return this._xpromise('update');
    },

    /**
     * Performs the activation of the pending update. I.e. replaces the current
     * cache with that updated in the update process. Normally, you want to
     * reload the application when the activation ends successfuly.
     *
     * @method activate
     * @return {Promise} A promise resolving into the activated version or
     * rejected with `no-activation-pending` if there was not an activation.
     */
    activate: function () {
      return this._xpromise('activate');
    },

    /**
     * Run the listeners for some type of event.
     *
     * @method _runListeners
     * @param type {String} The type of the events selecting the listeners to
     * be run.
     * @param evt {Object} The event contents.
     * @private
     */
    _runListeners: function (type, evt) {
      var listeners = this._eventListeners[type] || [];
      listeners.forEach(function (listenerAndThis) {
        var listener = listenerAndThis[0];
        var willBeThis = listenerAndThis[1];
        listener.call(willBeThis, evt);
      });
    },

    /**
     * Registers the listeners for enabling communication between the worker
     * and the client code.
     *
     * @method _installMessageHandlers
     * @private
     */
    _installMessageHandlers: function installMessageHandlers() {
      var that = this;
      if (!installMessageHandlers.done) {
        if (typeof BroadcastChannel === 'function') {
          var bc = new BroadcastChannel('offliner-channel');
          bc.onmessage = onmessage;
        }
        else {
          navigator.serviceWorker.addEventListener('message', onmessage);
        }
        installMessageHandlers.done = true;
      }

      function onmessage(e) {
        var msg = e.data;
        var type = msg ? msg.type : '';
        var typeAndSubType = type.split(':');
        if (typeAndSubType[0] === 'offliner') {
          that._handleMessage(typeAndSubType[1], msg);
        }
      }
    },

    /**
     * Make offliner to check for pending activations and dispatch
     * {{#crossLink "OfflinerClient/activationPending:event"}}{{/crossLink}}
     * if so.
     *
     * @method _checkForActivationPending
     * @private
     */
    _checkForActivationPending: function () {
      // TODO: should we add a prefix for offliner messages?
      this._send({ type: 'checkForActivationPending' });
    },

    /**
     * Discriminates between {{#crossLink "OfflinerClient/xpromise:event"}}{{/crossLink}}
     * events which are treated in a special way and the rest of the events that
     * simply trigger the default dispatching algorithm.
     *
     * @method _handleMessage
     * @param offlinerType {String} The type of the message without the
     * `offliner:` prefix.
     * @param msg {Any} The event.
     * @private
     */
    _handleMessage: function (offlinerType, msg) {
      var sw = navigator.serviceWorker;
      if (offlinerType === 'xpromise') {
        this._resolveCrossPromise(msg);
      }
      else {
        this._runListeners(offlinerType, msg);
      }
    },

    /**
     * @method _has
     * @param type {String} The type for the listener registration.
     * @param handler {Function} The listener.
     * @param willBeThis {Object} The context object `this` which the function
     * will be called with.
     * @return `true` if the listener registration already exists.
     * @private
     */
    _has: function (type, handler, willBeThis) {
      var listeners = this._eventListeners[type] || [];
      for (var i = 0, listenerAndThis; (listenerAndThis = listeners[i]); i++) {
        if (listenerAndThis[0] === handler &&
            listenerAndThis[1] === willBeThis) {
          return true;
        }
      }
      return false;
    },

    /**
     * Creates a cross promise registration. A _cross promise_ or xpromise
     * is a special kind of promise that is generated in the client but whose
     * implementation is in a worker.
     *
     * @method _xpromise
     * @param order {String} The string for the implementation part to select
     * the implementation to run.
     * @return {Promise} A promise delegating its implementation in some code
     * running in a worker.
     * @private
     */
    _xpromise: function (order) {
      return new Promise(function (accept, reject) {
        var uniqueId = nextPromiseId++;
        var msg = {
          type: 'xpromise',
          id: uniqueId,
          order: order
        };
        this._xpromises[uniqueId] = [accept, rejectWithError];
        this._send(msg);

        function rejectWithError(errorKey) {
          reject(new Error(errorKey)); // TODO: Add a OfflinerError type
        }
      }.bind(this));
    },

    /**
     * Sends a message to the worker.
     *
     * @method _send
     * @param msg {Any} The message to be sent.
     * @private
     */
    _send: function (msg) {
      navigator.serviceWorker.getRegistration(root)
        .then(function (registration) {
          if (!registration || !registration.active) {
            // TODO: Wait for the service worker to be active and try to
            // resend.
            console.warn('Not service worker active right now.');
          }
          else {
            return registration.active.postMessage(msg);
          }
        });
    },

    /**
     * Resolves a cross promise based on information received by the
     * implementation in the worker.
     *
     * @method _resolveCrossPromise
     * @param msg {Object} An object with the proper data to resolve a xpromise.
     * @private
     */
    _resolveCrossPromise: function (msg) {
      var implementation = this._xpromises[msg.id];
      if (implementation) {
        implementation[msg.status === 'rejected' ? 1 : 0](msg.value);
      }
      else {
        console.warn('Trying to resolve unexistent promise:', msg.id);
      }
    }
  };

}(this.exports || this));
