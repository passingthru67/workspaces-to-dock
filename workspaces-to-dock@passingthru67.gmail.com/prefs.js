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

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;


const WorkspacesToDockPreferencesWidget = new GObject.Class({
    Name: 'workspacesToDock.WorkspacesToDockPreferencesWidget',
    GTypeName: 'WorkspacesToDockPreferencesWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        let self = this;
        this.parent(params);
        this.settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._rtl = Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL;

        let notebook = new Gtk.Notebook();

        /* ================================================*/
        /* NOTEBOOK - MAIN SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookMainSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });
        let notebookMainSettingsTitle = new Gtk.Label({
            label: _("Main Settings"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5,
        });

        /* DOCK SETTINGS */

        let dockSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let dockSettingsTitle = new Gtk.Label({
            label: _("<b>Behavior</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        let dockSettingsMain1 = new Gtk.Box({
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let dockSettingsControl1 = new Gtk.Box({
            spacing: 20,
            margin_top: 10,
            margin_right: 10
        });

        let alwaysVisibleLabel = new Gtk.Label({
            label: _("Dock is fixed and always visible"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_left: 10
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
            row_homogeneous: false,
            column_homogeneous: false
        });

        let animationTimeLabel = new Gtk.Label({
            label: _("Animation time [ms]"),
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
            label: _("Show delay [ms]"),
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
            label: _("Hide delay [ms]"),
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

        /* VISIBILITY BEHAVIOR OPTIONS */
        let requireClick = new Gtk.CheckButton({
            label: _("Hover+click to show dock when window maximized"),
            margin_left: 0,
            margin_top: 10
        });
        requireClick.set_active(this.settings.get_boolean('require-click-to-show'));
        requireClick.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('require-click-to-show', check.get_active());
        }));

        let leaveVisible = new Gtk.CheckButton({
            label: _("Leave dock edge visible when slid out"),
            margin_left: 0,
            margin_top: 2
        });
        leaveVisible.set_active(this.settings.get_boolean('dock-edge-visible'));
        leaveVisible.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('dock-edge-visible', check.get_active());
        }));

        /* INTELLIHIDE AUTOHIDE SETTINGS */

        let dockSettingsGrid2 = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });

        let autohideLabel = new Gtk.Label({
            label: _("Autohide"),
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
            label: _("Intellihide"),
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

        /* INTELLIHIDE OPTIONS */

        let intellihideNormal =  new Gtk.RadioButton({
            label: _("Dodge all windows"),
            margin_top: 0
        });
        intellihideNormal.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('intellihide-option', 0);
        }));

        let intellihideFocusApp =  new Gtk.RadioButton({
            label: _("Dodge all instances of focused app"),
            group: intellihideNormal,
            margin_top: 2
        });
        intellihideFocusApp.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('intellihide-option', 1);
        }));

        let intellihideTopWindow =  new Gtk.RadioButton({
            label: _("Dodge only top instance of focused app"),
            group: intellihideNormal,
            margin_top: 2
        });
        intellihideTopWindow.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('intellihide-option', 2);
        }));

        let intellihideOption = this.settings.get_int('intellihide-option');
        switch (intellihideOption) {
            case 0:
                intellihideNormal.set_active(true); // any window .. normal mode
                break;
            case 1:
                intellihideFocusApp.set_active(true); // focused application windows mode
                break;
            case 2:
                intellihideTopWindow.set_active(true); // top focused application window mode
                break;
            default:
                intellihideNormal.set_active(true); // default .. any window
        }

        dockSettingsGrid1.attach(animationTimeLabel, 0, 0, 1, 1);
        dockSettingsGrid1.attach(animationTime, 1, 0, 1, 1);
        dockSettingsGrid1.attach(showDelayLabel, 0, 1, 1, 1);
        dockSettingsGrid1.attach(showDelay, 1, 1, 1, 1);
        dockSettingsGrid1.attach(hideDelayLabel, 0, 2, 1, 1);
        dockSettingsGrid1.attach(hideDelay, 1, 2, 1, 1);
        dockSettingsGrid1.attach(requireClick, 0, 3, 2, 1);
        dockSettingsGrid1.attach(leaveVisible, 0, 4, 2, 1);


        dockSettingsGrid2.attach(autohideLabel, 0, 0, 1, 1);
        dockSettingsGrid2.attach(autohide, 1, 0, 1, 1);
        dockSettingsGrid2.attach(intellihideLabel, 0, 1, 1, 1);
        dockSettingsGrid2.attach(intellihide, 1, 1, 1, 1);
        dockSettingsGrid2.attach(intellihideNormal, 0, 2, 2, 1);
        dockSettingsGrid2.attach(intellihideFocusApp, 0, 3, 2, 1);
        dockSettingsGrid2.attach(intellihideTopWindow, 0, 4, 2, 1);

        dockSettingsMain1.add(dockSettingsGrid1);
        dockSettingsMain1.add(dockSettingsGrid2);

        this.settings.bind('dock-fixed', dockSettingsMain1, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.settings.bind('intellihide', intellihideNormal, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('intellihide', intellihideFocusApp, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('intellihide', intellihideTopWindow, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        dockSettings.add(dockSettingsTitle);
        dockSettings.add(dockSettingsControl1);
        dockSettings.add(dockSettingsMain1);
        notebookMainSettings.add(dockSettings);

        /* BACKGROUND SETTINGS */

        let background = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let backgroundTitle = new Gtk.Label({
            label: _("<b>Background</b>"),
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
            label: _("Customize the dock background opacity"),
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
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let layerOpacityLabel = new Gtk.Label({
            label: _("Opacity"),
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
            label: _("Only when in autohide"),
            margin_left: 20
        });
        opaqueLayeralwaysVisible.set_active(!this.settings.get_boolean('opaque-background-always'));
        opaqueLayeralwaysVisible.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background-always', !check.get_active());
        }));

        this.settings.bind('opaque-background', opaqueLayerMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        opaqueLayerMain.add(layerOpacityLabel);
        opaqueLayerMain.add(layerOpacity);
        opaqueLayerMain.add(opaqueLayeralwaysVisible);

        background.add(backgroundTitle);
        background.add(opaqueLayerControl);
        background.add(opaqueLayerMain);

        notebookMainSettings.add(background);

        /* DOCK POSITION */

        let dockPosition = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let dockPositionTitle = new Gtk.Label({
            label: _("<b>Position</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        let dockMonitor = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_left: 10,
            margin_top: 10,
            margin_bottom: 5,
            margin_right: 10
        });

        let dockMonitorLabel = new Gtk.Label({label: _("Show the dock on following monitor (if attached)"), hexpand:true, xalign:0});
        let dockMonitorCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            dockMonitorCombo.append_text(_('Primary (default)'));
            dockMonitorCombo.append_text(_('1'));
            dockMonitorCombo.append_text(_('2'));
            dockMonitorCombo.append_text(_('3'));
            dockMonitorCombo.append_text(_('4'));

        let active = this.settings.get_int('preferred-monitor');
        if (active<0)
            active = 0;
        dockMonitorCombo.set_active(active);
        dockMonitorCombo.connect('changed', Lang.bind (this, function(widget) {
            let active = widget.get_active();
            if (active <=0)
                this.settings.set_int('preferred-monitor', -1);
            else
                this.settings.set_int('preferred-monitor', active );
        }));

        dockMonitor.add(dockMonitorLabel)
        dockMonitor.add(dockMonitorCombo);


        let dockHeightControl = new Gtk.Box({
            margin_left: 10,
            margin_top: 5,
            margin_bottom: 10,
            margin_right: 10
        });

        let extendHeightLabel = new Gtk.Label({
            label: _("Extend the height of the dock to fill the screen"),
            xalign: 0,
            hexpand: true
        });

        let extendHeight = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        extendHeight.set_active(this.settings.get_boolean('extend-height'));
        extendHeight.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('extend-height', check.get_active());
        }));

        dockHeightControl.add(extendHeightLabel);
        dockHeightControl.add(extendHeight);


        let dockHeightMargins = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            spacing: 20,
            margin_left: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let topMarginLabel = new Gtk.Label({
            label: _("Top Margin"),
            use_markup: true,
            xalign: 0
        });

        let topMargin = new Gtk.SpinButton();
        topMargin.set_range(0, 15);
        topMargin.set_value(this.settings.get_double('top-margin') * 100);
        topMargin.set_digits(1);
        topMargin.set_increments(.5, 1);
        topMargin.set_size_request(120, -1);
        topMargin.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('top-margin', s);
        }));
        topMargin.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        let bottomMarginLabel = new Gtk.Label({
            label: _("Bottom Margin"),
            use_markup: true,
            xalign: 0
        });

        let bottomMargin = new Gtk.SpinButton();
        bottomMargin.set_range(0, 15);
        bottomMargin.set_value(this.settings.get_double('bottom-margin') * 100);
        bottomMargin.set_digits(1);
        bottomMargin.set_increments(.5, 1);
        bottomMargin.set_size_request(120, -1);
        bottomMargin.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('bottom-margin', s);
        }));
        bottomMargin.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });


        this.settings.bind('extend-height', dockHeightMargins, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        dockHeightMargins.add(topMarginLabel);
        dockHeightMargins.add(topMargin);
        dockHeightMargins.add(bottomMarginLabel);
        dockHeightMargins.add(bottomMargin);

        dockPosition.add(dockPositionTitle);
        dockPosition.add(dockMonitor);
        dockPosition.add(dockHeightControl);
        dockPosition.add(dockHeightMargins);

        notebookMainSettings.add(dockPosition);
        notebook.append_page(notebookMainSettings, notebookMainSettingsTitle);




        /* ================================================*/
        /* NOTEBOOK - ADDITIONAL SETTINGS PAGE */
        /* ------------------------------------------------*/
        let notebookAdditionalSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });
        let notebookAdditionalSettingsTitle = new Gtk.Label({
            label: _("Additional Settings"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5,
        });



        /* WORKSPACE CAPTIONS */

        let workspaceCaptions = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let workspaceCaptionsTitle = new Gtk.Label({
            label: _("<b>Workspace Captions</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        let icon_previous, icon_next;
        if (this._rtl) {
            icon_previous = "go-next";
            icon_next = "go-previous";
        } else {
            icon_previous = "go-previous";
            icon_next = "go-next";
        }

        // Workspace Captions - Enable/Disable Controller
        let workspaceCaptionsControl = new Gtk.Box({
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let workspaceCaptionsLabel = new Gtk.Label({
            label: _("Add captions to workspace thumbnails"),
            xalign: 0,
            hexpand: true,
            margin_left: 10
        });

        let workspaceCaptionsSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        workspaceCaptionsSwitch.set_active(this.settings.get_boolean('workspace-captions'));
        workspaceCaptionsSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-captions', check.get_active());
        }));

        workspaceCaptionsControl.add(workspaceCaptionsLabel);
        workspaceCaptionsControl.add(workspaceCaptionsSwitch);


        let workspaceCaptionsGrid = new Gtk.Grid({
            row_homogeneous: true,
            column_homogeneous: false,
            margin_left: 20,
            margin_right: 10
        });

        // Workspace Captions - User Theme Support
        let wsCaptionThemeSupport =  new Gtk.CheckButton({
            label: _("User theme supports workspaces-to-dock captions"),
            hexpand: true
        });
        wsCaptionThemeSupport.set_active(this.settings.get_boolean('workspace-captions-support'));
        wsCaptionThemeSupport.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('workspace-captions-support', check.get_active());
        }));

        // Workspace Captions - Number
        let workspaceCaptionNumber = new Gtk.Box({
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 0,
            margin_bottom: 0,
            margin_right: 10
        });
        let wsCaptionNumber =  new Gtk.CheckButton({
            label: _("Show the workspace number"),
            hexpand: true
        });
        wsCaptionNumber.set_active(this._getItemExists('number'));
        wsCaptionNumber.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('number', wsCaptionNumberExpand.get_active());
            } else {
                this._removeItem('number');
            }
        }));
        let wsCaptionNumberExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionNumberExpand.set_active(this._getItemExpanded('number'));
        wsCaptionNumberExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('number', check.get_active());
        }));

        let wsCaptionNumber_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionNumber_MoveLeftButton.connect('clicked', function(){
            self._moveItem('number', 1);
        });
        let wsCaptionNumber_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionNumber_MoveRightButton.connect('clicked', function(){
            self._moveItem('number', -1);
        });

        // Workspace Captions - Name
        let workspaceCaptionName = new Gtk.Box({
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 0,
            margin_bottom: 0,
            margin_right: 10
        });
        let wsCaptionName =  new Gtk.CheckButton({
            label: _("Show the workspace name"),
            hexpand: true
        });
        wsCaptionName.set_active(this._getItemExists('name'));
        wsCaptionName.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('name', wsCaptionNameExpand.get_active());
            } else {
                this._removeItem('name');
            }
        }));

        let wsCaptionNameExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });
        wsCaptionNameExpand.set_active(this._getItemExpanded('name'));
        wsCaptionNameExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('name', check.get_active());
        }));

        let wsCaptionName_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionName_MoveLeftButton.connect('clicked', function(){
            self._moveItem('name', 1);
        });
        let wsCaptionName_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionName_MoveRightButton.connect('clicked', function(){
            self._moveItem('name', -1);
        });

        // Workspace Captions - Window Count
        let workspaceCaptionWindowCount = new Gtk.Box({
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 0,
            margin_bottom: 0,
            margin_right: 10
        });
        let wsCaptionWindowCount =  new Gtk.CheckButton({
            label: _("Show the workspace window count"),
            hexpand: true
        });

        wsCaptionWindowCount.set_active(this._getItemExists('windowcount'));
        wsCaptionWindowCount.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('windowcount', wsCaptionWindowCountExpand.get_active());
            } else {
                this._removeItem('windowcount');
            }
        }));

        let wsCaptionWindowCountUseImage =  new Gtk.CheckButton({
            label: _("Use image"),
            hexpand: true
        });
        wsCaptionWindowCountUseImage.set_active(this.settings.get_boolean('workspace-caption-windowcount-image'));
        wsCaptionWindowCountUseImage.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-caption-windowcount-image', check.get_active());
        }));

        let wsCaptionWindowCountExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionWindowCountExpand.set_active(this._getItemExpanded('windowcount'));
        wsCaptionWindowCountExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('windowcount', check.get_active());
        }));

        let wsCaptionWindowCount_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionWindowCount_MoveLeftButton.connect('clicked', function(){
            self._moveItem('windowcount', 1);
        });
        let wsCaptionWindowCount_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionWindowCount_MoveRightButton.connect('clicked', function(){
            self._moveItem('windowcount', -1);
        });

        // Workspace Captions - Window Apps (taskbar)
        let workspaceCaptionWindowApps = new Gtk.Box({
            spacing: 20,
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: false,
            margin_left: 20,
            margin_top: 0,
            margin_bottom: 0,
            margin_right: 10
        });
        let wsCaptionWindowApps =  new Gtk.CheckButton({
            label: _("Show the workspace taskbar (app icons)"),
            hexpand: true
        });
        wsCaptionWindowApps.set_active(this._getItemExists('windowapps'));
        wsCaptionWindowApps.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('windowapps', wsCaptionWindowAppsExpand.get_active());
            } else {
                this._removeItem('windowapps');
            }
        }));

        let wsCaptionWindowAppsUseLargeIcons =  new Gtk.CheckButton({
            label: _("Large icons"),
            hexpand: true
        });
        wsCaptionWindowAppsUseLargeIcons.set_active(this.settings.get_boolean('workspace-caption-large-icons'));
        wsCaptionWindowAppsUseLargeIcons.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-caption-large-icons', check.get_active());
        }));

        let wsCaptionWindowAppsExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });
        wsCaptionWindowAppsExpand.set_active(this._getItemExpanded('windowapps'));
        wsCaptionWindowAppsExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('windowapps', check.get_active());
        }));

        let wsCaptionWindowApps_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionWindowApps_MoveLeftButton.connect('clicked', function(){
            self._moveItem('windowapps', 1);
        });
        let wsCaptionWindowApps_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionWindowApps_MoveRightButton.connect('clicked', function(){
            self._moveItem('windowapps', -1);
        });

        // Workspace Captions - Spacer
        let wsCaptionSpacer =  new Gtk.CheckButton({
            label: _("Show a spacer/filler"),
            hexpand: true
        });

        wsCaptionSpacer.set_active(this._getItemExists('spacer'));
        wsCaptionSpacer.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('spacer', wsCaptionSpacerExpand.get_active());
            } else {
                this._removeItem('spacer');
            }
        }));

        let wsCaptionSpacerExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionSpacerExpand.set_active(this._getItemExpanded('spacer'));
        wsCaptionSpacerExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('spacer', check.get_active());
        }));

        let wsCaptionSpacer_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionSpacer_MoveLeftButton.connect('clicked', function(){
            self._moveItem('spacer', 1);
        });
        let wsCaptionSpacer_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionSpacer_MoveRightButton.connect('clicked', function(){
            self._moveItem('spacer', -1);
        });


        this.settings.bind('workspace-captions', workspaceCaptionsGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        workspaceCaptionsGrid.attach(wsCaptionThemeSupport, 0, 1, 2, 1);

        workspaceCaptionsGrid.attach(wsCaptionNumber, 0, 2, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionNumberExpand, 2, 2, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionNumber_MoveLeftButton, 3, 2, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionNumber_MoveRightButton, 4, 2, 1, 1);

        workspaceCaptionsGrid.attach(wsCaptionName, 0, 3, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionNameExpand, 2, 3, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionName_MoveLeftButton, 3, 3, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionName_MoveRightButton, 4, 3, 1, 1);

        workspaceCaptionsGrid.attach(wsCaptionWindowCount, 0, 4, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowCountUseImage, 1, 4, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowCountExpand, 2, 4, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowCount_MoveLeftButton, 3, 4, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowCount_MoveRightButton, 4, 4, 1, 1);

        workspaceCaptionsGrid.attach(wsCaptionWindowApps, 0, 5, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowAppsUseLargeIcons, 1, 5, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowAppsExpand, 2, 5, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowApps_MoveLeftButton, 3, 5, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionWindowApps_MoveRightButton, 4, 5, 1, 1);

        workspaceCaptionsGrid.attach(wsCaptionSpacer, 0, 6, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionSpacerExpand, 2, 6, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionSpacer_MoveLeftButton, 3, 6, 1, 1);
        workspaceCaptionsGrid.attach(wsCaptionSpacer_MoveRightButton, 4, 6, 1, 1);


        workspaceCaptions.add(workspaceCaptionsTitle);
        workspaceCaptions.add(workspaceCaptionsControl);
        workspaceCaptions.add(wsCaptionThemeSupport);
        workspaceCaptions.add(workspaceCaptionsGrid);
        notebookAdditionalSettings.add(workspaceCaptions);


        /* CUSTOM ACTIONS SETTINGS */

        let actions = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let actionsTitle = new Gtk.Label({
            label: _("<b>Custom Actions</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        let actionsMain = new Gtk.Box({
            margin_left: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        let toggleOverviewLabel = new Gtk.Label({
            label: _("Toggle overview mode with right click"),
            xalign: 0,
            hexpand: true
        });

        let toggleOverviewSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        toggleOverviewSwitch.set_active(this.settings.get_boolean('toggle-overview'));
        toggleOverviewSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('toggle-overview', check.get_active());
        }));

        actionsMain.add(toggleOverviewLabel);
        actionsMain.add(toggleOverviewSwitch);

        actions.add(actionsTitle);
        actions.add(actionsMain);
        notebookAdditionalSettings.add(actions);

        /* DASH INTEGRATION SETTINGS */

        let dashIntegration = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        let dashIntegrationTitle = new Gtk.Label({
            label: _("<b>Dash Integration</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        let dashIntegrationControl = new Gtk.Box({
            margin_left: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_right: 10
        });

        /* DASH-TO-DOCK HOVER */

        let dashToDockHoverLabel = new Gtk.Label({
            label: _("Show workspaces when hovering over Dash-To-Dock extension"),
            xalign: 0,
            hexpand: true
        });

        let dashToDockHover = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        dashToDockHover.set_active(this.settings.get_boolean('dashtodock-hover'));
        dashToDockHover.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('dashtodock-hover', check.get_active());
        }));


        dashIntegrationControl.add(dashToDockHoverLabel);
        dashIntegrationControl.add(dashToDockHover);

        dashIntegration.add(dashIntegrationTitle);
        dashIntegration.add(dashIntegrationControl);
        notebookAdditionalSettings.add(dashIntegration);

        notebook.append_page(notebookAdditionalSettings, notebookAdditionalSettingsTitle);



        this.add(notebook);

    },

    _getItemExists: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        return true;
    },

    _getItemExpanded: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        let currentItem = currentItems[index];
        let expandState = currentItem.split(':')[1];

        if (expandState == "false")
            return false

        return true;
    },

    _setItemExpanded: function(item, expandState) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        currentItems[index] = item + ":" + expandState;
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _addItem: function(item, expandState) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index != -1)
            return false;

        let newitem = item + ":" + expandState;

        currentItems.push(newitem);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _removeItem: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index < 0)
            return false;

        currentItems.splice(index, 1);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _moveItem: function(item, delta) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index < 0)
            return false;

        let newIndex = index + delta;
        if (newIndex < 0 || newIndex >= currentItems.length || newIndex == index) {
            return false;
        }

        currentItems.splice(newIndex, 0, currentItems.splice(index, 1)[0]);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    }
});

function init() {
    Convenience.initTranslations();
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
