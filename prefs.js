/* ========================================================================================================
 * prefs.js - preferences
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const _ = function(t) {
    return t;
};

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const WorkspacesToDockPreferencesWidget = new GObject.Class({
    Name: 'workspacesToDock.WorkspacesToDockPreferencesWidget',
    GTypeName: 'WorkspacesToDockPreferencesWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this.settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');

        let frame = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        /* MAIN DOCK SETTINGS */

        let dockSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let dockSettingsTitle = new Gtk.Label({
            label: "<b>Dock Settings</b>",
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        let dockSettingsMain1 = new Gtk.Box({
            spacing: 30,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: true,
            margin_left: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let dockSettingsControl1 = new Gtk.Box({
            spacing: 30,
            margin_left: 10,
            margin_top: 10,
            margin_right: 10
        });

        let alwaysVisibleLabel = new Gtk.Label({
            label: "Dock is fixed and always visible",
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let alwaysVisible = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        alwaysVisible.set_active(this.settings.get_boolean('dock-fixed'));
        alwaysVisible.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('dock-fixed', check.get_active());
        }));

        dockSettingsControl1.add(alwaysVisibleLabel);
        dockSettingsControl1.add(alwaysVisible);

        /* TIMINGS SETTINGS */

        let dockSettingsGrid1 = new Gtk.Grid({
            row_homogeneous: true,
            column_homogeneous: false
        });

        let animationTimeLabel = new Gtk.Label({
            label: "Animation time [ms]",
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let animationTime = new Gtk.SpinButton({
            halign: Gtk.Align.END
        });
        animationTime.set_sensitive(true);
        animationTime.set_range(0, 5000);
        animationTime.set_value(this.settings.get_double("animation-time") * 1000);
        animationTime.set_increments(50, 100);
        animationTime.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1000;
            this.settings.set_double("animation-time", s);
        }));

        let showDelayLabel = new Gtk.Label({
            label: "Show delay [ms]",
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let showDelay = new Gtk.SpinButton({
            halign: Gtk.Align.END
        });
        showDelay.set_sensitive(true);
        showDelay.set_range(0, 5000);
        showDelay.set_value(this.settings.get_double("show-delay") * 1000);
        showDelay.set_increments(50, 100);
        showDelay.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1000;
            this.settings.set_double("show-delay", s);
        }));

        let hideDelayLabel = new Gtk.Label({
            label: "Hide delay [ms]",
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let hideDelay = new Gtk.SpinButton({
            halign: Gtk.Align.END
        });
        hideDelay.set_sensitive(true);
        hideDelay.set_range(0, 5000);
        hideDelay.set_value(this.settings.get_double("hide-delay") * 1000);
        hideDelay.set_increments(50, 100);
        hideDelay.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1000;
            this.settings.set_double("hide-delay", s);
        }));

        /* INTELLIHIDE AUTOHIDE SETTINGS */

        let dockSettingsGrid2 = new Gtk.Grid({
            row_homogeneous: true,
            column_homogeneous: false
        });

        let autohideLabel = new Gtk.Label({
            label: "Autohide",
            xalign: 0,
            hexpand: true
        });

        let autohide = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        autohide.set_active(this.settings.get_boolean('autohide'));
        autohide.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('autohide', check.get_active());
        }));

        let intellihideLabel = new Gtk.Label({
            label: "intellihide",
            xalign: 0,
            hexpand: true
        });

        let intellihide = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        intellihide.set_active(this.settings.get_boolean('intellihide'));
        intellihide.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('intellihide', check.get_active());
        }));

        let topWindowOnly =  new Gtk.CheckButton({
            label: "Application based intellihide"
        });
        topWindowOnly.set_active(this.settings.get_boolean('intellihide-perapp'));
        topWindowOnly.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('intellihide-perapp', check.get_active());
        }));

        dockSettingsGrid1.attach(animationTimeLabel, 0, 0, 1, 1);
        dockSettingsGrid1.attach(animationTime, 1, 0, 1, 1);
        dockSettingsGrid1.attach(showDelayLabel, 0, 1, 1, 1);
        dockSettingsGrid1.attach(showDelay, 1, 1, 1, 1);
        dockSettingsGrid1.attach(hideDelayLabel, 0, 2, 1, 1);
        dockSettingsGrid1.attach(hideDelay, 1, 2, 1, 1);

        dockSettingsGrid2.attach(autohideLabel, 0, 0, 1, 1);
        dockSettingsGrid2.attach(autohide, 1, 0, 1, 1);
        dockSettingsGrid2.attach(intellihideLabel, 0, 1, 1, 1);
        dockSettingsGrid2.attach(intellihide, 1, 1, 1, 1);
        dockSettingsGrid2.attach(topWindowOnly, 0, 2, 1, 1);

        dockSettingsMain1.add(dockSettingsGrid1);
        dockSettingsMain1.add(dockSettingsGrid2);

        this.settings.bind('dock-fixed', dockSettingsMain1, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.settings.bind('intellihide', topWindowOnly, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        dockSettings.add(dockSettingsTitle);
        dockSettings.add(dockSettingsControl1);
        dockSettings.add(dockSettingsMain1);
        frame.add(dockSettings);

        /* BACKGROUND SETTINGS */

        let background = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let backgroundTitle = new Gtk.Label({
            label: "<b>Background</b>",
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        /* OPAQUE LAYER */

        let opaqueLayerControl = new Gtk.Box({
            margin_left: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let opaqueLayerLabel = new Gtk.Label({
            label: "Add an opaque layer below the dock",
            xalign: 0,
            hexpand: true
        });

        let opaqueLayer = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        opaqueLayer.set_active(this.settings.get_boolean('opaque-background'));
        opaqueLayer.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background', check.get_active());
        }));

        opaqueLayerControl.add(opaqueLayerLabel);
        opaqueLayerControl.add(opaqueLayer);

        let opaqueLayerMain = new Gtk.Box({
            spacing: 30,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let layerOpacityLabel = new Gtk.Label({
            label: "Layer opacity",
            use_markup: true,
            xalign: 0
        });

        let layerOpacity = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            valuePos: Gtk.PositionType.RIGHT
        });
        layerOpacity.set_range(0, 100);
        layerOpacity.set_value(this.settings.get_double('background-opacity') * 100);
        layerOpacity.set_digits(0);
        layerOpacity.set_increments(5, 5);
        layerOpacity.set_size_request(200, -1);
        layerOpacity.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('background-opacity', s);
        }));

        let opaqueLayeralwaysVisible = new Gtk.CheckButton({
            label: "always visible",
            margin_left: 20
        });
        opaqueLayeralwaysVisible.set_active(this.settings.get_boolean('opaque-background-always'));
        opaqueLayeralwaysVisible.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background-always', check.get_active());
        }));

        this.settings.bind('opaque-background', opaqueLayerMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        opaqueLayerMain.add(layerOpacityLabel);
        opaqueLayerMain.add(layerOpacity);
        opaqueLayerMain.add(opaqueLayeralwaysVisible);

        background.add(backgroundTitle);
        background.add(opaqueLayerControl);
        background.add(opaqueLayerMain);

        frame.add(background);

        this.add(frame);

    }
});

function init() {
    // Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspacesToDockPreferencesWidget({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 5,
        border_width: 5
    });
    widget.show_all();

    return widget;
}

