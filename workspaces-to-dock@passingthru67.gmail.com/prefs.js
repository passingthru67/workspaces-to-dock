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
const Gdk = imports.gi.Gdk;
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
        /* NOTEBOOK - GENERAL SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookAppearanceSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10,
            margin_bottom: 20
        });

        let notebookAppearanceSettingsTitle = new Gtk.Label({
            label: _("General"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: POSITION */

        let dockPositionTitle = new Gtk.Label({
            label: _("<b>Position</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* MONITOR WIDGETS */

        this._monitors = [];
        let dockMonitorLabel = new Gtk.Label({label: _("Show the dock on the following monitor (if attached)"), hexpand:true, xalign:0});
        let dockMonitorCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
        let gdkNMonitors = Gdk.Screen.get_default().get_n_monitors();
        let gdkPrimaryMonitor = Gdk.Screen.get_default().get_primary_monitor();
        // NOTE: we use gdk to get the primary monitor here which is always 0

        // Add primary monitor
        dockMonitorCombo.append_text(_('Primary Monitor'));
        this._monitors.push(0);

        // Add connected monitors
        let ctr = 0;
        for (let i = 0; i < gdkNMonitors; i++) {
            if (i !== gdkPrimaryMonitor) {
                ctr++;
                this._monitors.push(ctr);
                dockMonitorCombo.append_text(_('Secondary Monitor ') + ctr);
            }
        }

        let monitor = this.settings.get_int('preferred-monitor');

        // If one of the external monitor is set as preferred, show it even if not attached
        if ((monitor >= gdkNMonitors) && (monitor !== gdkPrimaryMonitor)) {
            this._monitors.push(monitor)
            dockMonitorCombo.append_text(_('Secondary Monitor ') + ++ctr);
        }

        dockMonitorCombo.set_active(this._monitors.indexOf(monitor));
        dockMonitorCombo.connect('changed', Lang.bind (this, function(widget) {
            let active = this._monitors[widget.get_active()];
            this.settings.set_int('preferred-monitor', active);
        }));

        // Add to layout
        let dockMonitorControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        dockMonitorControlGrid.attach(dockMonitorLabel, 0, 0, 1, 1);
        dockMonitorControlGrid.attach(dockMonitorCombo, 1, 0, 1, 1);


        /* POSITION WIDGETS */

        let dockPositionLabel = new Gtk.Label({label: _("Show the dock at the following screen position"), hexpand:true, xalign:0});
        let dockPositionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            // NOTE: Left and right are reversed in RTL languages

            dockPositionCombo.append_text(_("Top"));

            if (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL) {
                dockPositionCombo.append_text(_("Left"));
            } else {
                dockPositionCombo.append_text(_("Right"));
            }

            dockPositionCombo.append_text(_("Bottom"));

            if (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL) {
                dockPositionCombo.append_text(_("Right"));
            } else {
                dockPositionCombo.append_text(_("Left"));
            }

        let position = this.settings.get_enum('dock-position');
        dockPositionCombo.set_active(position);
        dockPositionCombo.connect('changed', Lang.bind (this, function(widget) {
                this.settings.set_enum('dock-position', widget.get_active());
        }));

        let hideDashButton = new Gtk.CheckButton({
            label: _("Hide the Gnome Shell Dash"),
            margin_left: 0,
            margin_top: 0
        });
        hideDashButton.set_active(this.settings.get_boolean('hide-dash'));
        hideDashButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('hide-dash', check.get_active());
        }));

        let hideWorkspaceSwitcherButton = new Gtk.CheckButton({
            label: _("Hide the Gnome Shell Workspace Switcher Popup"),
            margin_left: 0,
            margin_top: 0
        });
        hideWorkspaceSwitcherButton.set_active(this.settings.get_boolean('hide-workspace-switcher-popup'));
        hideWorkspaceSwitcherButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('hide-workspace-switcher-popup', check.get_active());
        }));

        let horizontalSwitchingButton = new Gtk.CheckButton({
            label: _("Use horizontal switching when the dock is positioned horizontally"),
            margin_left: 0,
            margin_top: 0
        });
        horizontalSwitchingButton.set_active(this.settings.get_boolean('horizontal-workspace-switching'));
        horizontalSwitchingButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('horizontal-workspace-switching', check.get_active());
        }));

        // Add to layout
        let dockPositionControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        dockPositionControlGrid.attach(dockPositionLabel, 0, 0, 1, 1);
        dockPositionControlGrid.attach(dockPositionCombo, 1, 0, 1, 1);
        dockPositionControlGrid.attach(hideDashButton, 0, 1, 1, 1);
        dockPositionControlGrid.attach(hideWorkspaceSwitcherButton, 0, 2, 1, 1);
        dockPositionControlGrid.attach(horizontalSwitchingButton, 0, 3, 1, 1);


        /* TITLE: HEIGHT */

        let dockHeightTitle = new Gtk.Label({
            label: _("<b>Height (Width when positioned horizontally)</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 25,
            margin_bottom: 5
        });


        /* HEIGHT WIDGETS */

        let customizeHeightLabel = new Gtk.Label({
            label: _("Customize the height (width) of the dock"),
            xalign: 0,
            hexpand: true
        });

        let customizeHeightSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        customizeHeightSwitch.set_active(this.settings.get_boolean('customize-height'));
        customizeHeightSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('customize-height', check.get_active());
        }));

        let customizeHeightAutosize =  new Gtk.RadioButton({
            label: _("Autosize the dock based on thumbnails and favorites"),
            margin_top: 0
        });

        let customizeHeightExtend =  new Gtk.RadioButton({
            label: _("Extend the dock to fill the screen"),
            group: customizeHeightAutosize,
            margin_top: 0
        });

        let customizeHeightOption = this.settings.get_int('customize-height-option');
        switch (customizeHeightOption) {
            case 0:
                customizeHeightAutosize.set_active(true); // autosize
                break;
            case 1:
                customizeHeightExtend.set_active(true); // extend
                break;
            default:
                customizeHeightAutosize.set_active(true); // default - autosize
        }

        customizeHeightAutosize.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('customize-height-option', 0);
        }));
        customizeHeightExtend.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('customize-height-option', 1);
        }));

        let centerThumbnails = new Gtk.CheckButton({
            label: _("Center the dock (thumbnails and favorites if dock is extended)"),
            margin_left: 0,
            margin_top: 0
        });
        centerThumbnails.set_active(this.settings.get_boolean('center-thumbnails-on-dock'));
        centerThumbnails.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('center-thumbnails-on-dock', check.get_active());
        }));


        let centerThumbnailsIndependently =  new Gtk.RadioButton({
            label: _("Center thumbnails and favorites individually on dock"),
            margin_top: 0,
            margin_left: 40
        });

        let centerThumbnailsJointly =  new Gtk.RadioButton({
            label: _("Combine thumbnails and favorites then center on dock"),
            group: centerThumbnailsIndependently,
            margin_top: 0,
            margin_left: 40
        });

        let centerThumbnailsOption = this.settings.get_int('center-thumbnails-option');
        switch (centerThumbnailsOption) {
            case 0:
                centerThumbnailsIndependently.set_active(true); // independently
                break;
            case 1:
                centerThumbnailsJointly.set_active(true); // jointly
                break;
            default:
                centerThumbnailsIndependently.set_active(true); // default - independently
        }

        centerThumbnailsIndependently.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('center-thumbnails-option', 0);
        }));
        centerThumbnailsJointly.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('center-thumbnails-option', 1);
        }));

        let topMarginLabel = new Gtk.Label({
            label: _("Top margin (Left when positioned horizontally)"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let topMarginSpinner = new Gtk.SpinButton();
        topMarginSpinner.set_range(0, 25);
        topMarginSpinner.set_value(this.settings.get_double('top-margin') * 100);
        topMarginSpinner.set_digits(1);
        topMarginSpinner.set_increments(.5, 1);
        topMarginSpinner.set_size_request(120, -1);
        topMarginSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('top-margin', s);
        }));
        topMarginSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        let bottomMarginLabel = new Gtk.Label({
            label: _("Bottom margin (Right when positioned horizontally)"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let bottomMarginSpinner = new Gtk.SpinButton();
        bottomMarginSpinner.set_range(0, 25);
        bottomMarginSpinner.set_value(this.settings.get_double('bottom-margin') * 100);
        bottomMarginSpinner.set_digits(1);
        bottomMarginSpinner.set_increments(.5, 1);
        bottomMarginSpinner.set_size_request(120, -1);
        bottomMarginSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('bottom-margin', s);
        }));
        bottomMarginSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        let screenEdgePaddingLabel = new Gtk.Label({
            label: _("Padding between dock (when fully shown) and edge of screen"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let screenEdgePaddingSpinner = new Gtk.SpinButton();
        screenEdgePaddingSpinner.set_range(0, 200);
        screenEdgePaddingSpinner.set_value(this.settings.get_double('screen-edge-padding') * 1);
        screenEdgePaddingSpinner.set_digits(0);
        screenEdgePaddingSpinner.set_increments(1, 10);
        screenEdgePaddingSpinner.set_size_request(120, -1);
        screenEdgePaddingSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 1;
            this.settings.set_double('screen-edge-padding', s);
        }));

        // Add to layout
        let dockHeightControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let dockHeightContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });
        dockHeightControlGrid.attach(customizeHeightLabel, 0, 0, 1, 1);
        dockHeightControlGrid.attach(customizeHeightSwitch, 1, 0, 1, 1);
        dockHeightContainerGrid.attach(customizeHeightAutosize, 0, 0, 1, 1);
        dockHeightContainerGrid.attach(customizeHeightExtend, 0, 1, 1, 1);
        dockHeightContainerGrid.attach(centerThumbnails, 0, 2, 1, 1);
        dockHeightContainerGrid.attach(centerThumbnailsIndependently, 0, 3, 1, 1);
        dockHeightContainerGrid.attach(centerThumbnailsJointly, 0, 4, 1, 1);
        dockHeightContainerGrid.attach(topMarginLabel, 0, 5, 1, 1);
        dockHeightContainerGrid.attach(topMarginSpinner, 1, 5, 1, 1);
        dockHeightContainerGrid.attach(bottomMarginLabel, 0, 6, 1, 1);
        dockHeightContainerGrid.attach(bottomMarginSpinner, 1, 6, 1, 1);
        dockHeightContainerGrid.attach(screenEdgePaddingLabel, 0, 7, 1, 1);
        dockHeightContainerGrid.attach(screenEdgePaddingSpinner, 1, 7, 1, 1);

        // Bind interactions
        this.settings.bind('customize-height', dockHeightContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('center-thumbnails-on-dock', centerThumbnailsIndependently, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('center-thumbnails-on-dock', centerThumbnailsJointly, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: APPEARANCE */

        let appearanceTitle = new Gtk.Label({
            label: _("<b>Appearance</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* OPAQUE LAYER WIDGETS */

        let opaqueLayerLabel = new Gtk.Label({
            label: _("Customize the dock background opacity"),
            xalign: 0,
            hexpand: true
        });

        let opaqueLayerSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        opaqueLayerSwitch.set_active(this.settings.get_boolean('opaque-background'));
        opaqueLayerSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background', check.get_active());
        }));

        let layerOpacityLabel = new Gtk.Label({
            label: _("Opacity"),
            use_markup: true,
            xalign: 0,
        });

        let layerOpacityScaler = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            valuePos: Gtk.PositionType.RIGHT,
            halign: Gtk.Align.START,
            margin_left: 20
        });
        layerOpacityScaler.set_range(0, 100);
        layerOpacityScaler.set_value(this.settings.get_double('background-opacity') * 100);
        layerOpacityScaler.set_digits(0);
        layerOpacityScaler.set_increments(5, 5);
        layerOpacityScaler.set_size_request(200, -1);
        layerOpacityScaler.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('background-opacity', s);
        }));

        // Add to layout
        let backgroundControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_left: 0
        });
        let backgroundContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_left: 10
        });
        backgroundControlGrid.attach(opaqueLayerLabel, 0, 0, 1, 1);
        backgroundControlGrid.attach(opaqueLayerSwitch, 1, 0, 1, 1);
        backgroundContainerGrid.attach(layerOpacityLabel, 0, 0, 1, 1);
        backgroundContainerGrid.attach(layerOpacityScaler, 1, 0, 1, 1);

        // Bind interactions
        this.settings.bind('opaque-background', backgroundContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* FORCE STRAIGHT CORNERS */
        let forceStraightCornersButton = new Gtk.CheckButton({
            label: _("Force straight corners"),
            margin_left: 0,
            margin_top: 15
        });
        forceStraightCornersButton.set_active(this.settings.get_boolean('straight-corners'));
        forceStraightCornersButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('straight-corners', check.get_active());
        }));



        /* ADD TO NOTEBOOK PAGE */
        notebookAppearanceSettings.add(dockPositionTitle);
        notebookAppearanceSettings.add(dockMonitorControlGrid);
        notebookAppearanceSettings.add(dockPositionControlGrid);
        notebookAppearanceSettings.add(dockHeightTitle);
        notebookAppearanceSettings.add(dockHeightControlGrid);
        notebookAppearanceSettings.add(dockHeightContainerGrid);
        notebookAppearanceSettings.add(appearanceTitle);
        notebookAppearanceSettings.add(backgroundControlGrid);
        notebookAppearanceSettings.add(backgroundContainerGrid);
        notebookAppearanceSettings.add(forceStraightCornersButton);
        notebook.append_page(notebookAppearanceSettings, notebookAppearanceSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - BEHAVIOR SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookBehaviorSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookBehaviorSettingsTitle = new Gtk.Label({
            label: _("Behavior"),
            use_markup: true,
            xalign: 0
        });


        /* TOGGLE OVERVIEW WIDGETS */
        let toggleOverviewButton = new Gtk.CheckButton({
            label: _("Toggle Gnome Shell's overview mode with right click"),
            margin_left: 0,
            margin_top: 15
        });
        toggleOverviewButton.set_active(this.settings.get_boolean('toggle-overview'));
        toggleOverviewButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('toggle-overview', check.get_active());
        }));


        /* SCROLL WITH TOUCHPAD */
        let scrollWithTouchpadButton = new Gtk.CheckButton({
            label: _("Prevent multiple workspace switching when using touchpad to scroll"),
            margin_left: 0,
            margin_top: 10
        });
        scrollWithTouchpadButton.set_active(this.settings.get_boolean('scroll-with-touchpad'));
        scrollWithTouchpadButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('scroll-with-touchpad', check.get_active());
        }));


        /* TITLE: INTELLIGENT HIDING */

        let visibilityTitle = new Gtk.Label({
            label: _("<b>Intelligent Hiding</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* ALWAYS VISIBLE WIDGETS */

        let alwaysVisibleLabel = new Gtk.Label({
            label: _("Turn on intelligent hiding otherwise dock is fixed and always visible"),
            use_markup: true,
            xalign: 0,
            margin_top: 0,
            hexpand: true
        });

        let alwaysVisibleSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 15
        });
        alwaysVisibleSwitch.set_active(!this.settings.get_boolean('dock-fixed'));
        alwaysVisibleSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('dock-fixed', !check.get_active());
        }));

        // Add to layout
        let visibilityControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        let visibilityContainerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            homogeneous: false,
            margin_left: 10,
            margin_top: 0,
            margin_bottom: 10,
            margin_right: 0
        });
        visibilityControlGrid.attach(alwaysVisibleLabel, 0, 0, 1, 1);
        visibilityControlGrid.attach(alwaysVisibleSwitch, 1, 0, 1, 1);

        // Bind interactions
        this.settings.bind('dock-fixed', visibilityContainerBox, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);


        /* TIMING WIDGETS */

        let timingLabel = new Gtk.Label({
            label: _("<b>Timing</b> : Adjust animation, show delay, and hide delay timing"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 10
        });

        let timingOptionsButton = new Gtk.Button({
            label: _("Timing Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        timingOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Timing Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* TIMING OPTIONS DIALOG */

            let animationTimeLabel = new Gtk.Label({
                label: _("Animation time [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true,
                margin_right: 5,
                margin_top: 0
            });

            let animationTimeSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            animationTimeSpinner.set_sensitive(true);
            animationTimeSpinner.set_range(0, 5000);
            animationTimeSpinner.set_value(this.settings.get_double("animation-time") * 1000);
            animationTimeSpinner.set_increments(50, 100);
            animationTimeSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("animation-time", s);
            }));

            let showDelayLabel = new Gtk.Label({
                label: _("Show delay [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true
            });

            let showDelaySpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END
            });
            showDelaySpinner.set_sensitive(true);
            showDelaySpinner.set_range(0, 5000);
            showDelaySpinner.set_value(this.settings.get_double("show-delay") * 1000);
            showDelaySpinner.set_increments(50, 100);
            showDelaySpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("show-delay", s);
            }));

            let hideDelayLabel = new Gtk.Label({
                label: _("Hide delay [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true
            });

            let hideDelaySpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END
            });
            hideDelaySpinner.set_sensitive(true);
            hideDelaySpinner.set_range(0, 5000);
            hideDelaySpinner.set_value(this.settings.get_double("hide-delay") * 1000);
            hideDelaySpinner.set_increments(50, 100);
            hideDelaySpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("hide-delay", s);
            }));

            // Add to layout
            let timingDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false,
                margin_top: 0
            });
            timingDialogGrid.attach(animationTimeLabel, 0, 1, 1, 1);
            timingDialogGrid.attach(animationTimeSpinner, 1, 1, 1, 1);
            timingDialogGrid.attach(showDelayLabel, 0, 2, 1, 1);
            timingDialogGrid.attach(showDelaySpinner, 1, 2, 1, 1);
            timingDialogGrid.attach(hideDelayLabel, 0, 3, 1, 1);
            timingDialogGrid.attach(hideDelaySpinner, 1, 3, 1, 1);

            // Add to dialog
            let timingDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            timingDialogContainerBox.add(timingDialogGrid);
            dialog.get_content_area().add(timingDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let timingGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0
        });
        timingGrid.attach(timingLabel, 0, 0, 1, 1);
        timingGrid.attach(timingOptionsButton, 0, 1, 1, 1);

        visibilityContainerBox.add(timingGrid);


        /* AUTOHIDE WIDGETS */

        let autohideLabel = new Gtk.Label({
            label: _("<b>Autohide</b> : Show the dock on mouse hover"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let autohideSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        autohideSwitch.set_active(this.settings.get_boolean('autohide'));
        autohideSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('autohide', check.get_active());
        }));

        let autohideOptionsButton = new Gtk.Button({
            label: _("Autohide Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        autohideOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Autohide Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* AUTOHIDE OPTIONS DIALOG */

            let enableInFullscreenButton = new Gtk.CheckButton({
                label: _("Enable autohide in fullscreen"),
                margin_left: 0,
                margin_top: 0
            });
            enableInFullscreenButton.set_active(this.settings.get_boolean('autohide-in-fullscreen'));
            enableInFullscreenButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('autohide-in-fullscreen', check.get_active());
            }));

            let requireClickButton = new Gtk.CheckButton({
                label: _("Require click to show the dock when window maximized"),
                margin_left: 0,
                margin_top: 0
            });
            requireClickButton.set_active(this.settings.get_boolean('require-click-to-show'));
            requireClickButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('require-click-to-show', check.get_active());
            }));

            let requirePressureButton = new Gtk.CheckButton({
                label: _("Require pressure to show the dock"),
                margin_left: 0,
                margin_top: 0
            });
            requirePressureButton.set_active(this.settings.get_boolean('require-pressure-to-show'));
            requirePressureButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('require-pressure-to-show', check.get_active());
            }));

            let pressureThresholdLabel = new Gtk.Label({
                label: _("Pressure threshold [px]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let pressureThresholdSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            pressureThresholdSpinner.set_sensitive(true);
            pressureThresholdSpinner.set_range(10, 1000);
            pressureThresholdSpinner.set_value(this.settings.get_double("pressure-threshold") * 1);
            pressureThresholdSpinner.set_increments(10, 20);
            pressureThresholdSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1;
                this.settings.set_double("pressure-threshold", s);
            }));

            let speedLimitButton = new Gtk.CheckButton({
                label: _("Limit pressure sense to slow mouse speeds"),
                margin_left: 0,
                margin_top: 0
            });
            speedLimitButton.set_active(this.settings.get_boolean('use-pressure-speed-limit'));
            speedLimitButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('use-pressure-speed-limit', check.get_active());
            }));

            let speedLimitLabel = new Gtk.Label({
                label: _("Maximum speed [px]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let speedLimitSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            speedLimitSpinner.set_sensitive(true);
            speedLimitSpinner.set_range(10, 1000);
            speedLimitSpinner.set_value(this.settings.get_double("pressure-speed-limit") * 1);
            speedLimitSpinner.set_increments(10, 20);
            speedLimitSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1;
                this.settings.set_double("pressure-speed-limit", s);
            }));

            let speedLimitDescription = new Gtk.Label({
                label: _("NOTE: For dual monitor setups. Allows the mouse to pass through \nthe barrier by attacking the edge of the screen with a quick stroke."),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: false
            })

            // Add to layout
            let autohideOptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });

            autohideOptionsDialogGrid.attach(enableInFullscreenButton, 0, 0, 2, 1);
            autohideOptionsDialogGrid.attach(requireClickButton, 0, 1, 2, 1);
            autohideOptionsDialogGrid.attach(requirePressureButton, 0, 2, 2, 1);
            autohideOptionsDialogGrid.attach(pressureThresholdLabel, 0, 3, 1, 1);
            autohideOptionsDialogGrid.attach(pressureThresholdSpinner, 1, 3, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitButton, 0, 4, 2, 1);
            autohideOptionsDialogGrid.attach(speedLimitLabel, 0, 5, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitSpinner, 1, 5, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitDescription, 0, 6, 2, 1);

            // Bind interactions
            this.settings.bind('require-pressure-to-show', pressureThresholdLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('require-pressure-to-show', pressureThresholdSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitDescription, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

            // Add to dialog
            let autohideOptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            autohideOptionsDialogContainerBox.add(autohideOptionsDialogGrid);
            dialog.get_content_area().add(autohideOptionsDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let autohideControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 10
        });
        let autohideContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        autohideControlGrid.attach(autohideLabel, 0, 0, 1, 1);
        autohideControlGrid.attach(autohideSwitch, 1, 0, 1, 1);
        autohideContainerGrid.attach(autohideOptionsButton, 0, 0, 1, 1);

        visibilityContainerBox.add(autohideControlGrid);
        visibilityContainerBox.add(autohideContainerGrid);

        // Bind interactions
        this.settings.bind('autohide', autohideContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* INTELLIHIDE WIDGETS */

        let intellihideLabel = new Gtk.Label({
            label: _("<b>Intellihide</b> : Show the dock unless a window overlaps"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let intellihideSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        intellihideSwitch.set_active(this.settings.get_boolean('intellihide'));
        intellihideSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('intellihide', check.get_active());
        }));

        let intellihideOptionsButton = new Gtk.Button({
            label: _("Intellihide Dodging Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        intellihideOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Intellihide Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* INTELLIHIDE OPTIONS DIALOG */

            let intellihideNormal =  new Gtk.RadioButton({
                label: _("Dodge all windows"),
                margin_top: 0
            });

            let intellihideFocusApp =  new Gtk.RadioButton({
                label: _("Dodge all instances of focused app"),
                group: intellihideNormal,
                margin_top: 0
            });

            let intellihideTopWindow =  new Gtk.RadioButton({
                label: _("Dodge only top instance of focused app"),
                group: intellihideNormal,
                margin_top: 0
            });

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

            intellihideNormal.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 0);
            }));

            intellihideFocusApp.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 1);
            }));

            intellihideTopWindow.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 2);
            }));

            let ignoreTopPanelButton = new Gtk.CheckButton({
                label: _("Ignore top panel menus"),
                margin_left: 0,
                margin_top: 0
            });
            ignoreTopPanelButton.set_active(this.settings.get_boolean('ignore-top-panel'));
            ignoreTopPanelButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('ignore-top-panel', check.get_active());
            }));

            let ignoreContextMenusButton = new Gtk.CheckButton({
                label: _("Ignore application context menus"),
                margin_left: 0,
                margin_top: 0
            });
            ignoreContextMenusButton.set_active(this.settings.get_boolean('ignore-context-menus'));
            ignoreContextMenusButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('ignore-context-menus', check.get_active());
            }));

            // Add to layout
            let intellihideOptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });
            intellihideOptionsDialogGrid.attach(intellihideNormal, 0, 0, 1, 1);
            intellihideOptionsDialogGrid.attach(intellihideFocusApp, 0, 1, 1, 1);
            intellihideOptionsDialogGrid.attach(intellihideTopWindow, 0, 2, 1, 1);
            intellihideOptionsDialogGrid.attach(ignoreTopPanelButton, 0, 3, 1, 1);
            intellihideOptionsDialogGrid.attach(ignoreContextMenusButton, 0, 4, 1, 1);

            // Add to dialog
            let intellihideOptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            intellihideOptionsDialogContainerBox.add(intellihideOptionsDialogGrid);
            dialog.get_content_area().add(intellihideOptionsDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let intellihideControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 10
        });
        let intellihideContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        intellihideControlGrid.attach(intellihideLabel, 0, 0, 1, 1);
        intellihideControlGrid.attach(intellihideSwitch, 1, 0, 1, 1);
        intellihideContainerGrid.attach(intellihideOptionsButton, 0, 0, 1, 1);

        visibilityContainerBox.add(intellihideControlGrid);
        visibilityContainerBox.add(intellihideContainerGrid);

        // Bind interactions
        this.settings.bind('intellihide', intellihideContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('intellihide', intellihideContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: ADDITIONAL HIDE-SHOW OPTIONS */

        let miscOptionsTitle = new Gtk.Label({
            label: _("<b>Additional Options</b>"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 15,
            margin_bottom: 5
        });


        /* ADDITIONAL HIDE-SHOW OPTIONS WIDGETS */

        let miscOptionsButton = new Gtk.Button({
            label: _("Additional Hiding & Showing Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        miscOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Additional Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* ADDITIONAL HIDE-SHOW OPTIONS DIALOG */

            let leaveVisibleButton = new Gtk.CheckButton({
                label: _("Leave a visible edge when dock is hidden"),
                margin_left: 0,
                margin_top: 0
            });
            leaveVisibleButton.set_active(this.settings.get_boolean('dock-edge-visible'));
            leaveVisibleButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('dock-edge-visible', check.get_active());
            }));

            let disableScrollButton = new Gtk.CheckButton({
                label: _("Disable scroll when dock is hidden to prevent workspace switching"),
                margin_left: 0,
                margin_top: 0
            });
            disableScrollButton.set_active(this.settings.get_boolean('disable-scroll'));
            disableScrollButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('disable-scroll', check.get_active());
            }));

            let dashToDockHoverButton = new Gtk.CheckButton({
                label: _("Show the dock when hovering over Dash-To-Dock extension"),
                margin_left: 0,
                margin_top: 0
            });
            dashToDockHoverButton.set_active(this.settings.get_boolean('dashtodock-hover'));
            dashToDockHoverButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('dashtodock-hover', check.get_active());
            }));

            let quickShowButton = new Gtk.CheckButton({
                label: _("Show the dock temporarily when switching workspaces"),
                margin_left: 0,
                margin_top: 0
            });
            quickShowButton.set_active(this.settings.get_boolean('quick-show-on-workspace-change'));
            quickShowButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('quick-show-on-workspace-change', check.get_active());
            }));

            let quickShowLabel = new Gtk.Label({
                label: _("Length of time shown [ms]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let quickShowSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            quickShowSpinner.set_sensitive(true);
            quickShowSpinner.set_range(100, 3000);
            quickShowSpinner.set_value(this.settings.get_double("quick-show-timeout") * 1);
            quickShowSpinner.set_increments(100, 1000);
            quickShowSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1;
                this.settings.set_double("quick-show-timeout", s);
            }));

            let toggleDockShortcutButton = new Gtk.CheckButton({
                label: _("Toggle the dock with a keyboard shortcut"),
                margin_left: 0,
                margin_top: 0
            });
            toggleDockShortcutButton.set_active(this.settings.get_boolean('toggle-dock-with-keyboard-shortcut'));
            toggleDockShortcutButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('toggle-dock-with-keyboard-shortcut', check.get_active());
            }));

            let toggleDockShortcutLabel = new Gtk.Label({
                label: _("Keyboard shortcut"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let toggleDockShortcutEntry = new Gtk.Entry({
                margin_top: 0,
                margin_left: 5,
                margin_right: 0,
                halign: Gtk.Align.END
            });
            toggleDockShortcutEntry.set_width_chars(20);
            toggleDockShortcutEntry.set_text(this.settings.get_strv('dock-keyboard-shortcut')[0]);
            toggleDockShortcutEntry.connect('changed', Lang.bind(this, function(entry) {
                let [key, mods] = Gtk.accelerator_parse(entry.get_text());
                if(Gtk.accelerator_valid(key, mods)) {
                    toggleDockShortcutEntry["secondary-icon-name"] = null;
                    toggleDockShortcutEntry["secondary-icon-tooltip-text"] = null;
                    let shortcut = Gtk.accelerator_name(key, mods);
                    this.settings.set_strv('dock-keyboard-shortcut', [shortcut]);
                } else {
                    toggleDockShortcutEntry["secondary-icon-name"] = "dialog-warning-symbolic";
                    toggleDockShortcutEntry["secondary-icon-tooltip-text"] = _("Invalid accelerator. Try F12, <Super>space, <Ctrl><Alt><Shift>w, etc.");
                }
            }));

            let toggleDockShortcutTimeoutLabel = new Gtk.Label({
                label: _("Timeout before dock is hidden again [s]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let toggleDockShortcutTimeoutSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            toggleDockShortcutTimeoutSpinner.set_range(1, 10);
            toggleDockShortcutTimeoutSpinner.set_value(this.settings.get_double('keyboard-toggle-timeout') * 1);
            toggleDockShortcutTimeoutSpinner.set_increments(1, 10);
            toggleDockShortcutTimeoutSpinner.connect('value-changed', Lang.bind(this, function(button) {
                let s = button.get_value() / 1;
                this.settings.set_double('keyboard-toggle-timeout', s);
            }));

            // Add to layout
            let additionalHideShowOptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });
            additionalHideShowOptionsDialogGrid.attach(miscOptionsTitle, 0, 0, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(leaveVisibleButton, 0, 1, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(disableScrollButton, 0, 2, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(dashToDockHoverButton, 0, 3, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(quickShowButton, 0, 4, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(quickShowLabel, 0, 5, 1, 1);
            additionalHideShowOptionsDialogGrid.attach(quickShowSpinner, 1, 5, 1, 1);
            additionalHideShowOptionsDialogGrid.attach(toggleDockShortcutButton, 0, 6, 2, 1);
            additionalHideShowOptionsDialogGrid.attach(toggleDockShortcutLabel, 0, 7, 1, 1);
            additionalHideShowOptionsDialogGrid.attach(toggleDockShortcutEntry, 1, 7, 1, 1);
            additionalHideShowOptionsDialogGrid.attach(toggleDockShortcutTimeoutLabel, 0, 8, 1, 1);
            additionalHideShowOptionsDialogGrid.attach(toggleDockShortcutTimeoutSpinner, 1, 8, 1, 1);

            /* Bind interactions */
            this.settings.bind('toggle-dock-with-keyboard-shortcut', toggleDockShortcutLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('toggle-dock-with-keyboard-shortcut', toggleDockShortcutEntry, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('toggle-dock-with-keyboard-shortcut', toggleDockShortcutTimeoutLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('toggle-dock-with-keyboard-shortcut', toggleDockShortcutTimeoutSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('quick-show-on-workspace-change', quickShowLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('quick-show-on-workspace-change', quickShowSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

            // Add to dialog
            let additionalHideShowOptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            additionalHideShowOptionsDialogContainerBox.add(additionalHideShowOptionsDialogGrid);
            dialog.get_content_area().add(additionalHideShowOptionsDialogContainerBox);
            dialog.show_all();
        }));

        visibilityContainerBox.add(miscOptionsTitle);
        visibilityContainerBox.add(miscOptionsButton);


        /* PARTIAL DOCK OPTIONS */

        let partialActionTitle = new Gtk.Label({
            label: _("<b>Partial Dock</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        let intellhideActionLabel = new Gtk.Label({label: _("What should we do with the dock when not dodging windows?"),
            hexpand:true,
            xalign:0
        });
        let intellhideActionCombo = new Gtk.ComboBoxText({
            margin_left: 10,
            halign:Gtk.Align.END
        });
        intellhideActionCombo.append_text(_('Show Full'));
        intellhideActionCombo.append_text(_('Show Partial'));
        intellhideActionCombo.append_text(_('Show Partial Fixed'));

        let intellhideAction = this.settings.get_enum('intellihide-action');
        intellhideActionCombo.set_active(intellhideAction);
        intellhideActionCombo.connect('changed', Lang.bind (this, function(widget) {
            this.settings.set_enum('intellihide-action', widget.get_active());
        }));

        // Add to layout
        let intellhideActionGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        intellhideActionGrid.attach(intellhideActionLabel, 0, 0, 1, 1);
        intellhideActionGrid.attach(intellhideActionCombo, 1, 0, 1, 1);
        this.settings.bind('intellihide', intellhideActionGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        let overviewActionLabel = new Gtk.Label({label: _("What should we do with the dock in overview mode?"),
            hexpand:true,
            xalign:0
        });
        let overviewActionCombo = new Gtk.ComboBoxText({
            margin_left: 10,
            halign:Gtk.Align.END
        });
        overviewActionCombo.append_text(_('Show Full'));
        overviewActionCombo.append_text(_('Hide'));
        overviewActionCombo.append_text(_('Show Partial'));

        let overviewAction = this.settings.get_enum('overview-action');
        overviewActionCombo.set_active(overviewAction);
        overviewActionCombo.connect('changed', Lang.bind (this, function(widget) {
            this.settings.set_enum('overview-action', widget.get_active());
        }));

        // Add to layout
        let overviewActionGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0,
            margin_bottom: 15
        });

        overviewActionGrid.attach(overviewActionLabel, 0, 0, 1, 1);
        overviewActionGrid.attach(overviewActionCombo, 1, 0, 1, 1);

        visibilityContainerBox.add(partialActionTitle);
        visibilityContainerBox.add(intellhideActionGrid);
        visibilityContainerBox.add(overviewActionGrid);


        /* ADD TO NOTEBOOK PAGE */
        notebookBehaviorSettings.add(toggleOverviewButton);
        notebookBehaviorSettings.add(scrollWithTouchpadButton);
        notebookBehaviorSettings.add(visibilityTitle);
        notebookBehaviorSettings.add(visibilityControlGrid);
        notebookBehaviorSettings.add(visibilityContainerBox);
        notebook.append_page(notebookBehaviorSettings, notebookBehaviorSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - THUMBNAILS SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookWorkspacesSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookWorkspacesSettingsTitle = new Gtk.Label({
            label: _("Thumbnails"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: THUMBNAILS */

        let customizeThumbnailTitle = new Gtk.Label({
            label: _("<b>Thumbnail Size</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* THUMBNAIL SIZE WIDGETS */

        let customizeThumbnailLabel = new Gtk.Label({
            label: _("Customize the workspace thumbnail size"),
            xalign: 0,
            hexpand: true
        });

        let customizeThumbnailSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        customizeThumbnailSwitch.set_active(this.settings.get_boolean('customize-thumbnail'));
        customizeThumbnailSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('customize-thumbnail', check.get_active());
        }));

        let thumbnailSizeLabel = new Gtk.Label({
            label: _("Thumbnail size"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let thumbnailSizeSpinner = new Gtk.SpinButton();
        thumbnailSizeSpinner.set_range(5, 25);
        thumbnailSizeSpinner.set_value(this.settings.get_double('thumbnail-size') * 100);
        thumbnailSizeSpinner.set_digits(1);
        thumbnailSizeSpinner.set_increments(.5, 1);
        thumbnailSizeSpinner.set_size_request(120, -1);
        thumbnailSizeSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('thumbnail-size', s);
        }));
        thumbnailSizeSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        // Add to layout
        let customizeThumbnailControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let customizeThumbnailContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });
        customizeThumbnailControlGrid.attach(customizeThumbnailLabel, 0, 0, 1, 1);
        customizeThumbnailControlGrid.attach(customizeThumbnailSwitch, 1, 0, 1, 1);
        customizeThumbnailContainerGrid.attach(thumbnailSizeLabel, 0, 0, 1, 1);
        customizeThumbnailContainerGrid.attach(thumbnailSizeSpinner, 1, 0, 1, 1);

        // Bind interactions
        this.settings.bind('customize-thumbnail', customizeThumbnailContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* THUMBNAIL VISIBLE WIDTH */

        let customizeThumbnailVisibleWidthLabel = new Gtk.Label({
            label: _("Customize the visible width (height) for intellihide show-partial"),
            xalign: 0,
            hexpand: true
        });

        let customizeThumbnailVisibleWidthSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        customizeThumbnailVisibleWidthSwitch.set_active(this.settings.get_boolean('customize-thumbnail-visible-width'));
        customizeThumbnailVisibleWidthSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('customize-thumbnail-visible-width', check.get_active());
        }));

        let thumbnailVisibleWidthLabel = new Gtk.Label({
            label: _("Visible width (height when positioned horizontally)"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let thumbnailVisibleWidthSpinner = new Gtk.SpinButton();
        thumbnailVisibleWidthSpinner.set_range(10, 60);
        thumbnailVisibleWidthSpinner.set_value(this.settings.get_double('thumbnail-visible-width') * 1);
        thumbnailVisibleWidthSpinner.set_digits(0);
        thumbnailVisibleWidthSpinner.set_increments(1, 10);
        thumbnailVisibleWidthSpinner.set_size_request(120, -1);
        thumbnailVisibleWidthSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 1;
            this.settings.set_double('thumbnail-visible-width', s);
        }));


        // Add to layout
        let customizeThumbnailVisibleWidthControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let customizeThumbnailVisibleWidthContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });
        customizeThumbnailVisibleWidthControlGrid.attach(customizeThumbnailVisibleWidthLabel, 0, 0, 1, 1);
        customizeThumbnailVisibleWidthControlGrid.attach(customizeThumbnailVisibleWidthSwitch, 1, 0, 1, 1);
        customizeThumbnailVisibleWidthContainerGrid.attach(thumbnailVisibleWidthLabel, 0, 0, 1, 1);
        customizeThumbnailVisibleWidthContainerGrid.attach(thumbnailVisibleWidthSpinner, 1, 0, 1, 1);


        // Bind interactions
        this.settings.bind('customize-thumbnail-visible-width', customizeThumbnailVisibleWidthContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: THUMBNAIL CAPTIONS */

        let workspaceCaptionsTitle = new Gtk.Label({
            label: _("<b>Thumbnail Captions</b>"),
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


        /* THUMBNAIL CAPTIONS WIDGETS */

        let workspaceCaptionsLabel = new Gtk.Label({
            label: _("Add captions to workspace thumbnails"),
            xalign: 0,
            hexpand: true,
            margin_left: 0
        });

        let workspaceCaptionsSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        workspaceCaptionsSwitch.set_active(this.settings.get_boolean('workspace-captions'));
        workspaceCaptionsSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-captions', check.get_active());
        }));

        // Workspace Caption - Position
        let wsCaptionPositionLabel = new Gtk.Label({label: _("Show the caption at the following position"), hexpand:true, xalign:0});
        let wsCaptionPositionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
        wsCaptionPositionCombo.append_text(_("Bottom"));
        wsCaptionPositionCombo.append_text(_("Top"));

        let captionPosition = this.settings.get_enum('workspace-caption-position');
        wsCaptionPositionCombo.set_active(captionPosition);
        wsCaptionPositionCombo.connect('changed', Lang.bind (this, function(widget) {
                this.settings.set_enum('workspace-caption-position', widget.get_active());
        }));

        // Workspace Captions - Height
        let wsCaptionHeightLabel = new Gtk.Label({
            label: _("Caption height [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let wsCaptionHeightSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        wsCaptionHeightSpinner.set_sensitive(true);
        wsCaptionHeightSpinner.set_range(10, 50);
        wsCaptionHeightSpinner.set_value(this.settings.get_double("workspace-caption-height") * 1);
        wsCaptionHeightSpinner.set_increments(1, 5);
        wsCaptionHeightSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-height", s);
        }));

        // Workspace Captions - Window Apps (taskbar) tooltips
        let wsCaptionWindowAppsTitleTooltipButton = new Gtk.CheckButton({
            label: _("Show Taskbar tooltips"),
            margin_left: 0,
            margin_top: 0,
            margin_bottom: 10,
        });
        wsCaptionWindowAppsTitleTooltipButton.set_active(this.settings.get_boolean('workspace-caption-taskbar-tooltips'));
        wsCaptionWindowAppsTitleTooltipButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-caption-taskbar-tooltips', check.get_active());
        }));

        // Workspace Captions - Window Apps (taskbar) Icon Size
        let wsCaptionWindowAppsIconSizeLabel = new Gtk.Label({
            label: _("Taskbar icon size [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let wsCaptionWindowAppsIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        wsCaptionWindowAppsIconSizeSpinner.set_sensitive(true);
        wsCaptionWindowAppsIconSizeSpinner.set_range(10, 50);
        wsCaptionWindowAppsIconSizeSpinner.set_value(this.settings.get_double("workspace-caption-taskbar-icon-size") * 1);
        wsCaptionWindowAppsIconSizeSpinner.set_increments(1, 5);
        wsCaptionWindowAppsIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-taskbar-icon-size", s);
        }));

        // Workspace captions - Popupmenu Icon Size
        let wsCaptionMenuIconSizeLabel = new Gtk.Label({
            label: _("Caption popup menu icon size [px]"),
            use_markup: true,
            xalign: 0,
            margin_top: 0,
            hexpand: true
        });

        let wsCaptionMenuIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        wsCaptionMenuIconSizeSpinner.set_sensitive(true);
        wsCaptionMenuIconSizeSpinner.set_range(10, 50);
        wsCaptionMenuIconSizeSpinner.set_value(this.settings.get_double("workspace-caption-menu-icon-size") * 1);
        wsCaptionMenuIconSizeSpinner.set_increments(1, 5);
        wsCaptionMenuIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-menu-icon-size", s);
        }));


        /* CAPTION ITEMS WIDGETS */

        let workspaceCaptionItemsTitle = new Gtk.Label({
            label: _("<b>Caption Items</b> : Customize the items on the caption"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });


        let workspaceCaptionItemsButton = new Gtk.Button({
            label: _("Caption Items .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        workspaceCaptionItemsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Caption Items"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* CAPTION ITEMS DIALOG */

            // Workspace Captions - Number
            let wsCaptionNumberButton =  new Gtk.CheckButton({
                label: _("Show workspace number"),
                hexpand: true
            });
            wsCaptionNumberButton.set_active(this._getItemExists('number'));
            wsCaptionNumberButton.connect('toggled', Lang.bind(this, function(check){
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
            let wsCaptionNameButton =  new Gtk.CheckButton({
                label: _("Show workspace name"),
                hexpand: true
            });
            wsCaptionNameButton.set_active(this._getItemExists('name'));
            wsCaptionNameButton.connect('toggled', Lang.bind(this, function(check){
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
            let wsCaptionWindowCount =  new Gtk.CheckButton({
                label: _("Show workspace window count"),
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
            let wsCaptionWindowApps =  new Gtk.CheckButton({
                label: _("Show workspace taskbar (apps)"),
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


            // Add to layout
            let workspaceCaptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });


            workspaceCaptionsDialogGrid.attach(wsCaptionNumberButton, 0, 5, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionNumberExpand, 2, 5, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionNumber_MoveLeftButton, 3, 5, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionNumber_MoveRightButton, 4, 5, 1, 1);

            workspaceCaptionsDialogGrid.attach(wsCaptionNameButton, 0, 6, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionNameExpand, 2, 6, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionName_MoveLeftButton, 3, 6, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionName_MoveRightButton, 4, 6, 1, 1);

            workspaceCaptionsDialogGrid.attach(wsCaptionWindowCount, 0, 7, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowCountUseImage, 1, 7, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowCountExpand, 2, 7, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowCount_MoveLeftButton, 3, 7, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowCount_MoveRightButton, 4, 7, 1, 1);

            workspaceCaptionsDialogGrid.attach(wsCaptionWindowApps, 0, 8, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowAppsExpand, 2, 8, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowApps_MoveLeftButton, 3, 8, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionWindowApps_MoveRightButton, 4, 8, 1, 1);

            workspaceCaptionsDialogGrid.attach(wsCaptionSpacer, 0, 9, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionSpacerExpand, 2, 9, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionSpacer_MoveLeftButton, 3, 9, 1, 1);
            workspaceCaptionsDialogGrid.attach(wsCaptionSpacer_MoveRightButton, 4, 9, 1, 1);

            // Add to dialog
            let workspaceCaptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            workspaceCaptionsDialogContainerBox.add(workspaceCaptionsDialogGrid);
            dialog.get_content_area().add(workspaceCaptionsDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let workspaceCaptionsControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let workspaceCaptionsContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });

        workspaceCaptionsControlGrid.attach(workspaceCaptionsLabel, 0, 0, 1, 1);
        workspaceCaptionsControlGrid.attach(workspaceCaptionsSwitch, 1, 0, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionPositionLabel, 0, 2, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionPositionCombo, 1, 2, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionHeightLabel, 0, 3, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionHeightSpinner, 1, 3, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionMenuIconSizeLabel, 0, 4, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionMenuIconSizeSpinner, 1, 4, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsIconSizeLabel, 0, 5, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsIconSizeSpinner, 1, 5, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsTitleTooltipButton, 0, 6, 1, 1);

        workspaceCaptionsContainerGrid.attach(workspaceCaptionItemsTitle, 0, 7, 1, 1);
        workspaceCaptionsContainerGrid.attach(workspaceCaptionItemsButton, 0, 8, 1, 1);

        // Bind interactions
        this.settings.bind('workspace-captions', workspaceCaptionsContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);











        /* TITLE: MISC OPTIONS */

        let workspaceOptionsTitle = new Gtk.Label({
            label: _("<b>Miscellaneous Options</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        /* MISC OPTIONS WIDGETS */

        let thumbnailCaptionPopupMenuHideShortcutsPanel = new Gtk.CheckButton({
            label: _("Hide the favorite shortcuts panel when a popup menu is shown"),
            margin_left: 0,
            margin_top: 0
        });
        thumbnailCaptionPopupMenuHideShortcutsPanel.set_active(this.settings.get_boolean('thumbnails-popupmenu-hide-shortcuts'));
        thumbnailCaptionPopupMenuHideShortcutsPanel.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('thumbnails-popupmenu-hide-shortcuts', check.get_active());
        }));

        let thumbnailCaptionPopupMenuHideShortcutsPanelNote = new Gtk.Label({
            label: _("NOTE: Only applies when the shortcuts panel is set to inside orientation"),
            xalign: 0,
            margin_left: 25,
            margin_top: 0
        });

        // Add to layout
        let workspaceOptionsControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0,
            margin_bottom: 20
        });
        workspaceOptionsControlGrid.attach(thumbnailCaptionPopupMenuHideShortcutsPanel, 0, 0, 1, 1);
        workspaceOptionsControlGrid.attach(thumbnailCaptionPopupMenuHideShortcutsPanelNote, 0, 1, 1, 1);


        /* ADD TO NOTEBOOK PAGE */
        notebookWorkspacesSettings.add(customizeThumbnailTitle);
        notebookWorkspacesSettings.add(customizeThumbnailControlGrid);
        notebookWorkspacesSettings.add(customizeThumbnailContainerGrid);
        notebookWorkspacesSettings.add(customizeThumbnailVisibleWidthControlGrid);
        notebookWorkspacesSettings.add(customizeThumbnailVisibleWidthContainerGrid);
        notebookWorkspacesSettings.add(workspaceCaptionsTitle);
        notebookWorkspacesSettings.add(workspaceCaptionsControlGrid);
        notebookWorkspacesSettings.add(workspaceCaptionsContainerGrid);
        // notebookWorkspacesSettings.add(workspaceOptionsTitle);
        // notebookWorkspacesSettings.add(workspaceOptionsControlGrid);
        notebook.append_page(notebookWorkspacesSettings, notebookWorkspacesSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - FAVORITES SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookDashSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookDashSettingsTitle = new Gtk.Label({
            label: _("Favorites"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: FAVORITE SHORTCUTS PANEL */

        let shortcutsPanelTitle = new Gtk.Label({
            label: _("<b>Favorite Shortcuts Panel</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* SHORTCUTS PANEL WIDGETS */

        let shortcutsPanelLabel = new Gtk.Label({
            label: _("Show a favorite shortcuts panel"),
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let shortcutsPanelSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        shortcutsPanelSwitch.set_active(this.settings.get_boolean('show-shortcuts-panel'));
        shortcutsPanelSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('show-shortcuts-panel', check.get_active());
        }));

        let shortcutsPanelOrientationLabel = new Gtk.Label({label: _("Shortcuts panel orientation in reference to the thumbnails"),
            hexpand:true,
            xalign:0
        });
        let shortcutsPanelOrientationCombo = new Gtk.ComboBoxText({
            halign:Gtk.Align.END
        });
        shortcutsPanelOrientationCombo.append_text(_('Outside'));
        shortcutsPanelOrientationCombo.append_text(_('Inside'));

        let orientation = this.settings.get_enum('shortcuts-panel-orientation');
        if (orientation > 1)
            orientation = 0;

        shortcutsPanelOrientationCombo.set_active(orientation);
        shortcutsPanelOrientationCombo.connect('changed', Lang.bind (this, function(widget) {
            this.settings.set_enum('shortcuts-panel-orientation', widget.get_active());
        }));

        let shortcutsPanelIconSizeLabel = new Gtk.Label({
            label: _("Shortcuts panel icon size [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let shortcutsPanelIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        shortcutsPanelIconSizeSpinner.set_sensitive(true);
        shortcutsPanelIconSizeSpinner.set_range(12, 64);
        shortcutsPanelIconSizeSpinner.set_value(this.settings.get_double("shortcuts-panel-icon-size") * 1);
        shortcutsPanelIconSizeSpinner.set_increments(1, 5);
        shortcutsPanelIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("shortcuts-panel-icon-size", s);
        }));

        let setSwarmAnimationButton = new Gtk.CheckButton({
            label: _("Use the Apps button as the source of the swarm animation"),
            margin_left: 0,
            margin_top: 0
        });
        setSwarmAnimationButton.set_active(this.settings.get_boolean('shortcuts-panel-appsbutton-animation'));
        setSwarmAnimationButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-appsbutton-animation', check.get_active());
        }));


        /* TITLE: MISC OPTIONS */

        let shortcutsPanelOptionsTitle = new Gtk.Label({
            label: _("<b>Miscellaneous Options</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* MISC OPTIONS WIDGETS */

        let shortcutsPanelShowRunning = new Gtk.CheckButton({
            label: _("Show running applications"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowRunning.set_active(this.settings.get_boolean('shortcuts-panel-show-running'));
        shortcutsPanelShowRunning.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-running', check.get_active());
        }));

        let shortcutsPanelShowPlaces = new Gtk.CheckButton({
            label: _("Show places"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowPlaces.set_active(this.settings.get_boolean('shortcuts-panel-show-places'));
        shortcutsPanelShowPlaces.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-places', check.get_active());
        }));

        let shortcutsPanelShowWindowCount = new Gtk.CheckButton({
            label: _("Show application window count indicators"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowWindowCount.set_active(this.settings.get_boolean('shortcuts-panel-show-window-count-indicators'));
        shortcutsPanelShowWindowCount.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-window-count-indicators', check.get_active());
        }));

        let shortcutsPanelAppsbuttonAtBottom = new Gtk.CheckButton({
            label: _("Set the Apps button at the bottom"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelAppsbuttonAtBottom.set_active(this.settings.get_boolean('shortcuts-panel-appsbutton-at-bottom'));
        shortcutsPanelAppsbuttonAtBottom.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-appsbutton-at-bottom', check.get_active());
        }));

        let shortcutsPanelPopupMenuArrowAtTop = new Gtk.CheckButton({
            label: _("Set the menu context arrow at the top of the popup menu dialog"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelPopupMenuArrowAtTop.set_active(this.settings.get_boolean('shortcuts-panel-popupmenu-arrow-at-top'));
        shortcutsPanelPopupMenuArrowAtTop.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-popupmenu-arrow-at-top', check.get_active());
        }));

        let shortcutsPanelPopupMenuHideThumbnails = new Gtk.CheckButton({
            label: _("Hide thumbnails when a popup menu dialog is shown"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelPopupMenuHideThumbnails.set_active(this.settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails'));
        shortcutsPanelPopupMenuHideThumbnails.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-popupmenu-hide-thumbnails', check.get_active());
        }));

        let shortcutsPanelPopupMenuHideThumbnailsNote = new Gtk.Label({
            label: _("NOTE: Only applies when the shortcuts panel is set to outside orientation"),
            use_markup: true,
            xalign: 0,
            margin_left: 25,
            margin_top: 0
        });

        // Add to layout
        let shortcutsPanelControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let shortcutsPanelContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10,
            margin_bottom: 10
        });
        shortcutsPanelControlGrid.attach(shortcutsPanelLabel, 0, 1, 1, 1);
        shortcutsPanelControlGrid.attach(shortcutsPanelSwitch, 1, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOrientationLabel, 0, 0, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOrientationCombo, 1, 0, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelIconSizeLabel, 0, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelIconSizeSpinner, 1, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(setSwarmAnimationButton, 0, 2, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOptionsTitle, 0, 3, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowRunning, 0, 4, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowPlaces, 0, 5, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowWindowCount, 0, 6, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelAppsbuttonAtBottom, 0, 7, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuArrowAtTop, 0, 8, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuHideThumbnails, 0, 9, 2, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuHideThumbnailsNote, 0, 10, 2, 1);

        // Bind interactions
        this.settings.bind('show-shortcuts-panel', shortcutsPanelContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* ADD TO NOTEBOOK PAGE */
        notebookDashSettings.add(shortcutsPanelTitle);
        notebookDashSettings.add(shortcutsPanelControlGrid);
        notebookDashSettings.add(shortcutsPanelContainerGrid);
        notebook.append_page(notebookDashSettings, notebookDashSettingsTitle);



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
