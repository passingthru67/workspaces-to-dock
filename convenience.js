/* ========================================================================================================
 * convenience.js - convenience functions
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

/* 
 * Part of this file comes from gnome-shell-extensions:
 * http://git.gnome.org/browse/gnome-shell-extensions/
 * 
 */

// try to simplify global signals handling
const globalSignalHandler = function() {

    this._init();
} 

globalSignalHandler.prototype = {

    _init: function() {
        this._signals = new Object();
    },

    push: function(/*unlimited 3-long array arguments*/){
        this._addSignals('generic', arguments);
    },

    disconnect: function() {
        for (let label in this._signals) {
            this.disconnectWithLabel(label);
        }
    },

    pushWithLabel: function(label /* plus unlimited 3-long array arguments*/) {
        // skip first element of the arguments array;
        let elements = new Array;
        for (let i = 1 ; i< arguments.length; i++) {
            elements.push(arguments[i]);
        }
        this._addSignals(label, elements);
    },

    _addSignals: function(label, elements) {
        if (this._signals[label] == undefined) {
            this._signals[label] = new Array();
        }
        for (let i = 0; i < elements.length; i++) { 
            let object = elements[i][0];
            let event = elements[i][1];
            let id = object.connect(event, elements[i][2]);
            this._signals[label].push([object, id]);
        }
    },

    disconnectWithLabel: function(label) {
        if (this._signals[label]) {
            for (let i = 0; i < this._signals[label].length; i++) {
                this._signals[label][i][0].disconnect(this._signals[label][i][1]);
            }
            delete this._signals[label];
        }
    }
};
