/**
 * CSInterface.js — Adobe CEP Bridge
 * Minimal implementation for Silence Remover Pro
 * Full: https://github.com/Adobe-CEP/CEP-Resources
 */
'use strict';

function CSInterface() {
    var csLib = null;
    try { if (typeof window.__adobe_cep__ !== 'undefined') csLib = window.__adobe_cep__; } catch(e) {}
    this._csLib = csLib;
    this._eventListeners = {};
}

CSInterface.prototype.evalScript = function(script, callback) {
    if (!this._csLib) {
        if (typeof callback === 'function') callback('{"success":false,"error":"CSInterface not available"}');
        return;
    }
    try { this._csLib.evalScript(script, callback); }
    catch(e) { if (typeof callback === 'function') callback('{"success":false,"error":"' + e.message + '"}'); }
};

CSInterface.prototype.addEventListener = function(type, listener, obj) {
    if (!this._eventListeners[type]) this._eventListeners[type] = [];
    this._eventListeners[type].push({ callback: listener, scope: obj });
    if (this._csLib) {
        try {
            var self = this;
            this._csLib.addEventListener(type, function(event) {
                (self._eventListeners[type] || []).forEach(function(l) {
                    l.callback.call(l.scope || window, { type: type, data: event });
                });
            });
        } catch(e) {}
    }
};

CSInterface.prototype.removeEventListener = function(type, listener) {
    if (!this._eventListeners[type]) return;
    this._eventListeners[type] = this._eventListeners[type].filter(function(l) { return l.callback !== listener; });
};

CSInterface.prototype.openURLInDefaultBrowser = function(url) {
    if (!this._csLib) { window.open(url); return; }
    try { this._csLib.openURLInDefaultBrowser(url); } catch(e) { window.open(url); }
};

CSInterface.prototype.closeExtension = function() {
    if (!this._csLib) return;
    try { this._csLib.closeExtension(); } catch(e) {}
};

if (typeof module !== 'undefined' && module.exports) { module.exports = CSInterface; }
