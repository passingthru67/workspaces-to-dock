/* ========================================================================================================
 * myThumbnailsBox.js - thumbnailsbox object
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  Part of this code was copied from the gnome-shell-extensions framework
 *  http://git.gnome.org/browse/gnome-shell-extensions/
  * ========================================================================================================
 */

const _DEBUG_ = false;

const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
//const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;

// The maximum size of a thumbnail is 1/8 the width and height of the screen
let MAX_THUMBNAIL_SCALE = 1/8.;

const RESCALE_ANIMATION_TIME = 0.2;
const SLIDE_ANIMATION_TIME = 0.2;

// When we create workspaces by dragging, we add a "cut" into the top and
// bottom of each workspace so that the user doesn't have to hit the
// placeholder exactly.
const WORKSPACE_CUT_SIZE = 10;

const WORKSPACE_KEEP_ALIVE_TIME = 100;

const OVERRIDE_SCHEMA = 'org.gnome.shell.overrides';

const CAPTION_HEIGHT = 40; // NOTE: Must be larger than CAPTION_APP_ICON_SIZE_ZOOMED + css icon padding + css icon border
const CAPTION_BACKGROUND_HEIGHT = 22;
const CAPTION_APP_ICON_NORMAL_SIZE = 16;
const CAPTION_APP_ICON_NORMAL_SIZE_ZOOMED = 24;
const CAPTION_APP_ICON_LARGE_SIZE = 24;
const CAPTION_APP_ICON_LARGE_SIZE_ZOOMED = 32;


const ThumbnailState = {
    NEW: 0,
    ANIMATING_IN: 1,
    NORMAL: 2,
    REMOVING: 3,
    ANIMATING_OUT: 4,
    ANIMATED_OUT: 5,
    COLLAPSING: 6,
    DESTROYED: 7
};


const myWorkspaceThumbnail = new Lang.Class({
    Name: 'workspacesToDock.myWorkspaceThumbnail',
    Extends: WorkspaceThumbnail.WorkspaceThumbnail,

    _init: function(metaWorkspace, gsCurrentVersion, mySettings) {
        this.parent(metaWorkspace);
        
        this._gsCurrentVersion = gsCurrentVersion;
        this._mySettings = mySettings;
        this._wsWindowAppsButtons = [];
        this._afterWindowAddedId = this.metaWorkspace.connect_after('window-added',
                                                          Lang.bind(this, this._onAfterWindowAdded));
        this._afterWindowRemovedId = this.metaWorkspace.connect_after('window-removed',
                                                           Lang.bind(this, this._onAfterWindowRemoved));
    },

    workspaceRemoved: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: workspaceRemoved w="+this.metaWorkspace);
        this.metaWorkspace.disconnect(this._afterWindowAddedId);
        this.metaWorkspace.disconnect(this._afterWindowRemovedId);

        this.parent();
    },

    _onAfterWindowAdded: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowAdded wsp="+this.metaWorkspace);
        // Add window button to WindowApps of thumbnail caption
        this._updateWindowApps(metaWin, 0);
    },

    _onAfterWindowRemoved: function(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved wsp="+this.metaWorkspace);
        // Remove window button from WindowApps of thumbnail caption
        this._updateWindowApps(metaWin, 1);
    },

    _onWindowChanged: function(metaWin) {
        let index = -1;
        for (let i = 0; i < this._wsWindowAppsButtons.length; i++) {
            if (this._wsWindowAppsButtons[i].metaWin == metaWin) {
                index = i;
                break;
            }
        }
        if (index > -1) {
            let button = this._wsWindowApps.get_child_at_index(index);
            if (metaWin.appears_focused) {
                global.log("button app is focused");
                if (this._gsCurrentVersion[1] > 4)
                    button.add_style_class_name('popup-menu-item');
                button.add_style_pseudo_class('active');
            } else {
                global.log("button app is not focused");
                if (this._gsCurrentVersion[1] > 4)
                    button.remove_style_class_name('popup-menu-item');
                button.remove_style_pseudo_class('active');
            }
        }
    },
    
    _onWindowAppsButtonClick: function(actor, event, thumbnail, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowAppsButtonClick");
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            let activeWorkspace = global.screen.get_active_workspace();
            if (_DEBUG_) global.log("_onWindowAppsButtonClick: activeWorkspace = "+activeWorkspace);
            if (_DEBUG_) global.log("_onWindowAppsButtonClick: metaWorkspace = "+thumbnail.metaWorkspace);
            if (activeWorkspace != thumbnail.metaWorkspace) {
                if (_DEBUG_) global.log("_onWindowAppsButtonClick: activeWorkspace is metaWorkspace");
                thumbnail.activate(event.get_time());
                metaWin.activate(global.get_current_time());
            } else {
                metaWin.activate(global.get_current_time());
                if (!metaWin.has_focus())
                    metaWin.activate(global.get_current_time());
                else 
                    metaWin.minimize(global.get_current_time());
            }
        }
        return false;
    },

    _onWindowAppsButtonEnter: function(actor, event, icon) {
        //let icon = actor.get_child();
        //icon._delegate.setIconSize(24);
        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
            icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE_ZOOMED);
        } else {
            icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE_ZOOMED);
        }
        //icon.actor.add_style_pseudo_class('hover');
    },

    _onWindowAppsButtonLeave: function(actor, event, icon) {
        //let icon = actor.get_child();
        //icon._delegate.setIconSize(20);
        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
            icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
        } else {
            icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
        }
        //icon.actor.remove_style_pseudo_class('hover');
    },

    _updateWindowApps: function(metaWin, action) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowApps - action = "+action);
        if (action == 0) {
            if (this._wsWindowApps) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _wsWindowApps exists");
                let index = -1;
                for (let i = 0; i < this._wsWindowAppsButtons.length; i++) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: window button at index "+i+" is "+this._wsWindowAppsButtons[i]);
                    if (this._wsWindowAppsButtons[i].metaWin == metaWin) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: window button found at index = "+i);
                        index = i;
                        break;
                    }
                }
                if (index < 0) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: window button not found .. add it");
                    let tracker = Shell.WindowTracker.get_default();
                    let app = tracker.get_window_app(metaWin);
                    if (app) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: window button app = "+app.get_name());
                        //let icon = new AppDisplay.AppIcon(app, {setSizeManually: true, showLabel: false});
                        let iconParams = {setSizeManually: true, showLabel: false};
                        iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return app.create_icon_texture(iconSize);});
                        
                        let icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
                        icon.actor.add_style_class_name('workspacestodock-caption-windowapps-button-icon');
                        if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
                            icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
                        } else {
                            icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
                        }


                        let button;
                        if (this._gsCurrentVersion[1] < 6) {
                            button = new St.Button({style_class:'workspacestodock-caption-windowapps-button'});
                        } else {
                            button = new St.Button({style_class:'app-well-app workspacestodock-caption-windowapps-button'});
                        }
                        button.set_child(icon.actor);
                        button.connect('button-release-event', Lang.bind(this, this._onWindowAppsButtonClick, this, metaWin));
                        button.connect('enter-event', Lang.bind(this, this._onWindowAppsButtonEnter, icon));
                        button.connect('leave-event', Lang.bind(this, this._onWindowAppsButtonLeave, icon));
                        
                        if (metaWin.has_focus()) {
                            if (this._gsCurrentVersion[1] > 4)
                                button.add_style_class_name('popup-menu-item');
                            button.add_style_pseudo_class('active');
                        }
                            
                        this._wsWindowApps.add(button, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END});
                        //this._wsWindowAppsButtons.push(metaWin);

                        let winInfo = {};
                        winInfo.metaWin = metaWin;
                        winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', Lang.bind(this, this._onWindowChanged, metaWin));
                        this._wsWindowAppsButtons.push(winInfo);
                        
                    }
                }
            }
        }
        if (action == 1) {
            if (this._wsWindowApps) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _wsWindowApps exists");
                
                if (metaWin.minimized) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: metaWin minimized = "+metaWin);
                    
                } else {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: metaWin closed = "+metaWin);
                    let index = -1;
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: window buttons count = "+this._wsWindowAppsButtons.length);
                    for (let i = 0; i < this._wsWindowAppsButtons.length; i++) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: window button at index "+i+" is "+this._wsWindowAppsButtons[i]);
                        if (this._wsWindowAppsButtons[i].metaWin == metaWin) {    
                            if (_DEBUG_) global.log("myWorkspaceThumbnail: window button found at index = "+i);
                            index = i;
                            break;
                        }
                    }
                    if (index > -1) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: Splicing _wsWindowAppsButtons at "+index);
                        // Disconnect window focused signal
                        metaWin.disconnect(this._wsWindowAppsButtons[index].signalFocusedId);
                        // Remove button from windowAppsButtons list
                        this._wsWindowAppsButtons.splice(index, 1);
                        let button = this._wsWindowApps.get_child_at_index(index);
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: Removing button at index "+index+" is "+button);
                        this._wsWindowApps.remove_actor(button);
                        button.destroy();
                    }
                }
            }
        }
    }
    
});


const myThumbnailsBox = new Lang.Class({
    Name: 'workspacesToDock.myThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(gsCurrentVersion, settings) {
        this._gsCurrentVersion = gsCurrentVersion;
        this._mySettings = settings;
        if (this._gsCurrentVersion[1] < 7) {
            this.parent();
        } else {
            // override GS38 _init to remove create/destroy thumbnails when showing/hiding overview
            this.actor = new Shell.GenericContainer({ reactive: true,
                                                      style_class: 'workspace-thumbnails',
                                                      request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT });
            this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
            this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
            this.actor.connect('allocate', Lang.bind(this, this._allocate));
            this.actor._delegate = this;

            // When we animate the scale, we don't animate the requested size of the thumbnails, rather
            // we ask for our final size and then animate within that size. This slightly simplifies the
            // interaction with the main workspace windows (instead of constantly reallocating them
            // to a new size, they get a new size once, then use the standard window animation code
            // allocate the windows to their new positions), however it causes problems for drawing
            // the background and border wrapped around the thumbnail as we animate - we can't just pack
            // the container into a box and set style properties on the box since that box would wrap
            // around the final size not the animating size. So instead we fake the background with
            // an actor underneath the content and adjust the allocation of our children to leave space
            // for the border and padding of the background actor.
            this._background = new St.Bin({ style_class: 'workspace-thumbnails-background' });

            this.actor.add_actor(this._background);

            let indicator = new St.Bin({ style_class: 'workspace-thumbnail-indicator' });

            // We don't want the indicator to affect drag-and-drop
            Shell.util_set_hidden_from_pick(indicator, true);

            this._indicator = indicator;
            this.actor.add_actor(indicator);

            this._dropWorkspace = -1;
            this._dropPlaceholderPos = -1;
            this._dropPlaceholder = new St.Bin({ style_class: 'placeholder' });
            this.actor.add_actor(this._dropPlaceholder);

            this._targetScale = 0;
            this._scale = 0;
            this._pendingScaleUpdate = false;
            this._stateUpdateQueued = false;
            this._animatingIndicator = false;
            this._indicatorY = 0; // only used when _animatingIndicator is true

            this._stateCounts = {};
            for (let key in ThumbnailState)
                this._stateCounts[ThumbnailState[key]] = 0;

            this._thumbnails = [];

            this.actor.connect('button-press-event', function() { return true; });
            this.actor.connect('button-release-event', Lang.bind(this, this._onButtonRelease));

            //Main.overview.connect('showing',
            //                      Lang.bind(this, this._createThumbnails));
            //Main.overview.connect('hidden',
            //                      Lang.bind(this, this._destroyThumbnails));

            Main.overview.connect('item-drag-begin',
                                  Lang.bind(this, this._onDragBegin));
            Main.overview.connect('item-drag-end',
                                  Lang.bind(this, this._onDragEnd));
            Main.overview.connect('item-drag-cancelled',
                                  Lang.bind(this, this._onDragCancelled));
            Main.overview.connect('window-drag-begin',
                                  Lang.bind(this, this._onDragBegin));
            Main.overview.connect('window-drag-end',
                                  Lang.bind(this, this._onDragEnd));
            Main.overview.connect('window-drag-cancelled',
                                  Lang.bind(this, this._onDragCancelled));

            this._settings = new Gio.Settings({ schema: OVERRIDE_SCHEMA });
            this._settings.connect('changed::dynamic-workspaces',
                Lang.bind(this, this._updateSwitcherVisibility));
        }    
    },

    // override GS38 _createThumbnails to remove global n-workspaces notification
    _createThumbnails: function() {
        if (_DEBUG_) global.log("mythumbnailsBox: _createThumbnails");
        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));
        //this._nWorkspacesNotifyId =
            //global.screen.connect('notify::n-workspaces',
                                  //Lang.bind(this, this._workspacesChanged));
        this._syncStackingId =
            Main.overview.connect('windows-restacked',
                                  Lang.bind(this, this._syncStacking));

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        // The "porthole" is the portion of the screen that we show in the workspaces
        this._porthole = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);

        this.addThumbnails(0, global.screen.n_workspaces);

        this._updateSwitcherVisibility();
    },

	// override _onButtonRelease to provide overview on right click
    _onButtonRelease: function(actor, event) {
        if (_DEBUG_) global.log("mythumbnailsBox: _onButtonRelease");
        if (this._mySettings.get_boolean('toggle-overview')) {
            let button = event.get_button();
            if (button == 3) { //right click
                if (Main.overview.visible) {
                    Main.overview.hide(); // force normal mode
                } else {
                    Main.overview.show(); // force overview mode
                }
                return false;
            }
        }
        let [stageX, stageY] = event.get_coords();
        let [r, x, y] = this.actor.transform_stage_point(stageX, stageY);

        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i]
            let [w, h] = thumbnail.actor.get_transformed_size();
            if (y >= thumbnail.actor.y && y <= thumbnail.actor.y + h) {
                //thumbnail.activate(event.time);
                thumbnail.activate(event.get_time());
                break;
            }
        }
        return true;

    },

    // override _activeWorkspaceChanged to eliminate errors thrown
    _activeWorkspaceChanged: function(wm, from, to, direction) {
        if (_DEBUG_) global.log("mythumbnailsBox: _activeWorkspaceChanged");
        let thumbnail;
        let activeWorkspace = global.screen.get_active_workspace();
        for (let i = 0; i < this._thumbnails.length; i++) {
            if (this._thumbnails[i].metaWorkspace == activeWorkspace) {
                thumbnail = this._thumbnails[i];
                break;
            }
        }

        // passingthru67 - needed in case thumbnail is null outside of overview
        if (thumbnail == null)
            return
        
        // passingthru67 - needed in case thumbnail.actor is null outside of overview    
        if (thumbnail.actor == null)
            return

        // passingthru67 - conditional for gnome shell 3.4/3.6/# differences
        if (this._gsCurrentVersion[1] < 6) {
            this._animatingIndicator = true;
            this.indicatorY = this._indicator.allocation.y1;
        } else {
            this._animatingIndicator = true;
            let indicatorThemeNode = this._indicator.get_theme_node();
            let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
            this.indicatorY = this._indicator.allocation.y1 + indicatorTopFullBorder;
        }

        Tweener.addTween(this,
                         { indicatorY: thumbnail.actor.allocation.y1,
                           time: WorkspacesView.WORKSPACE_SWITCH_TIME,
                           transition: 'easeOutQuad',
                           onComplete: function() {
                               this._animatingIndicator = false;
                               this._queueUpdateStates();
                           },
                           onCompleteScope: this
                         });
    },
    

    // override _allocate to provide workspaceThumbnail captions
    _allocate: function(actor, box, flags) {
        let rtl = (Clutter.get_default_text_direction () == Clutter.TextDirection.RTL);

        // See comment about this._background in _init()
        let themeNode = this._background.get_theme_node();
        let contentBox = themeNode.get_content_box(box);

        if (this._thumbnails.length == 0) // not visible
            return;

        let portholeWidth = this._porthole.width;
        let portholeHeight = this._porthole.height;
        let spacing = this.actor.get_theme_node().get_length('spacing');

        // passingthru67 - Caption area below thumbnail used to display thumbnail labels
        let captionHeight = 0;
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionHeight = CAPTION_HEIGHT;
            captionBackgroundHeight = CAPTION_BACKGROUND_HEIGHT;
        }
        
        spacing = spacing + captionBackgroundHeight;
        
        // Compute the scale we'll need once everything is updated
        let nWorkspaces = global.screen.n_workspaces;
        
        // passingthru67 - add 4px to totalSpacing calculation
        // otherwise newScale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 4px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing = (nWorkspaces - 1) * (spacing + 4);
        let avail = (contentBox.y2 - contentBox.y1) - totalSpacing;

        let newScale = (avail / nWorkspaces) / portholeHeight;
        newScale = Math.min(newScale, MAX_THUMBNAIL_SCALE);
        if (newScale != this._targetScale) {
            if (this._targetScale > 0) {
                // We don't do the tween immediately because we need to observe the ordering
                // in queueUpdateStates - if workspaces have been removed we need to slide them
                // out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }

        let thumbnailHeight = portholeHeight * this._scale;
        
        let thumbnailWidth = Math.round(portholeWidth * this._scale);
        let roundedHScale = thumbnailWidth / portholeWidth;

        let slideOffset; // X offset when thumbnail is fully slid offscreen
        if (rtl)
            slideOffset = - (thumbnailWidth + themeNode.get_padding(St.Side.LEFT));
        else
            slideOffset = thumbnailWidth + themeNode.get_padding(St.Side.RIGHT);

        let childBox = new Clutter.ActorBox();

        // The background is horizontally restricted to correspond to the current thumbnail size
        // but otherwise covers the entire allocation
        if (rtl) {
            childBox.x1 = box.x1;
            childBox.x2 = box.x2 - ((contentBox.x2 - contentBox.x1) - thumbnailWidth);
        } else {
            childBox.x1 = box.x1 + ((contentBox.x2 - contentBox.x1) - thumbnailWidth);
            childBox.x2 = box.x2;
        }
        childBox.y1 = box.y1;
        childBox.y2 = box.y2;
        this._background.allocate(childBox, flags);

        // when not animating, the workspace position overrides this._indicatorY
        let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;

        let y = contentBox.y1;

        // passingthru67 - conditional for gnome shell 3.4/3.6/# differences
        if (this._gsCurrentVersion[1] < 6) {
            let indicatorY = this._indicatorY;
            // when not animating, the workspace position overrides this._indicatorY
            // passingthru67 - moved above
            //let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;
            
            // passingthru67 - moved above
            //let y = contentBox.y1;

            if (this._dropPlaceholderPos == -1) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.hide();
                }));
            }

            for (let i = 0; i < this._thumbnails.length; i++) {
                let thumbnail = this._thumbnails[i];

                if (i > 0)
                    y += spacing - Math.round(thumbnail.collapseFraction * spacing);

                let x1, x2;
                if (rtl) {
                    x1 = contentBox.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = contentBox.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                }

                if (i == this._dropPlaceholderPos) {
                    let [minHeight, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
                    childBox.x1 = x1;
                    childBox.x2 = x1 + thumbnailWidth;
                    childBox.y1 = Math.round(y);
                    childBox.y2 = Math.round(y + placeholderHeight);
                    this._dropPlaceholder.allocate(childBox, flags);
                    Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                        this._dropPlaceholder.show();
                    }));
                    y += placeholderHeight + spacing;
                }

                // We might end up with thumbnailHeight being something like 99.33
                // pixels. To make this work and not end up with a gap at the bottom,
                // we need some thumbnails to be 99 pixels and some 100 pixels height;
                // we compute an actual scale separately for each thumbnail.
                let y1 = Math.round(y);
                let y2 = Math.round(y + thumbnailHeight);
                let roundedVScale = (y2 - y1) / portholeHeight;

                if (thumbnail.metaWorkspace == indicatorWorkspace)
                    indicatorY = y1;

                
                // Allocating a scaled actor is funny - x1/y1 correspond to the origin
                // of the actor, but x2/y2 are increased by the *unscaled* size.
                childBox.x1 = x1;
                childBox.x2 = x1 + portholeWidth;
                childBox.y1 = y1;
                // passingthru67 - size needs to include caption area
                //childBox.y2 = y1 + portholeHeight;
                childBox.y2 = y1 + portholeHeight + (captionBackgroundHeight/roundedVScale);

                thumbnail.actor.set_scale(roundedHScale, roundedVScale);
                thumbnail.actor.allocate(childBox, flags);

                // passingthru67 - set WorkspaceThumbnail labels
                if (this._mySettings.get_boolean('workspace-captions'))
                    this._setThumbnailCaption(thumbnail, i, captionHeight, captionBackgroundHeight);

                // We round the collapsing portion so that we don't get thumbnails resizing
                // during an animation due to differences in rounded, but leave the uncollapsed
                // portion unrounded so that non-animating we end up with the right total
                y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapseFraction);
            }

            if (rtl) {
                childBox.x1 = contentBox.x1;
                childBox.x2 = contentBox.x1 + thumbnailWidth;
            } else {
                childBox.x1 = contentBox.x2 - thumbnailWidth;
                childBox.x2 = contentBox.x2;
            }
            childBox.y1 = indicatorY;
            // passingthru67 - indicator needs to include caption
            //childBox.y2 = childBox.y1 + thumbnailHeight;
            childBox.y2 = childBox.y1 + thumbnailHeight + captionBackgroundHeight;
            this._indicator.allocate(childBox, flags);

        } else {
            let indicatorY1 = this._indicatorY;
            let indicatorY2;
            // when not animating, the workspace position overrides this._indicatorY
            // passingthru67 - moved above
            //let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;
            let indicatorThemeNode = this._indicator.get_theme_node();

            let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
            let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
            let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
            let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

            // passingthru67 - moved above
            //let y = contentBox.y1;

            if (this._dropPlaceholderPos == -1) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.hide();
                }));
            }

            for (let i = 0; i < this._thumbnails.length; i++) {
                let thumbnail = this._thumbnails[i];

                if (i > 0)
                    y += spacing - Math.round(thumbnail.collapseFraction * spacing);

                let x1, x2;
                if (rtl) {
                    x1 = contentBox.x1 + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                } else {
                    x1 = contentBox.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                    x2 = x1 + thumbnailWidth;
                }

                if (i == this._dropPlaceholderPos) {
                    let [minHeight, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
                    childBox.x1 = x1;
                    childBox.x2 = x1 + thumbnailWidth;
                    childBox.y1 = Math.round(y);
                    childBox.y2 = Math.round(y + placeholderHeight);
                    this._dropPlaceholder.allocate(childBox, flags);
                    Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                        this._dropPlaceholder.show();
                    }));
                    y += placeholderHeight + spacing;
                }

                // We might end up with thumbnailHeight being something like 99.33
                // pixels. To make this work and not end up with a gap at the bottom,
                // we need some thumbnails to be 99 pixels and some 100 pixels height;
                // we compute an actual scale separately for each thumbnail.
                let y1 = Math.round(y);
                let y2 = Math.round(y + thumbnailHeight);
                let roundedVScale = (y2 - y1) / portholeHeight;

                if (thumbnail.metaWorkspace == indicatorWorkspace) {
                    indicatorY1 = y1;
                    indicatorY2 = y2;
                }

                // Allocating a scaled actor is funny - x1/y1 correspond to the origin
                // of the actor, but x2/y2 are increased by the *unscaled* size.
                childBox.x1 = x1;
                childBox.x2 = x1 + portholeWidth;
                childBox.y1 = y1;
                // passingthru67 - size needs to include caption area
                //childBox.y2 = y1 + portholeHeight;
                childBox.y2 = y1 + portholeHeight + (captionBackgroundHeight/roundedVScale);

                thumbnail.actor.set_scale(roundedHScale, roundedVScale);
                thumbnail.actor.allocate(childBox, flags);


                // passingthru67 - set WorkspaceThumbnail labels
                if (this._mySettings.get_boolean('workspace-captions'))
                    this._setThumbnailCaption(thumbnail, i, captionHeight, captionBackgroundHeight);
                
                // We round the collapsing portion so that we don't get thumbnails resizing
                // during an animation due to differences in rounded, but leave the uncollapsed
                // portion unrounded so that non-animating we end up with the right total
                y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapseFraction);
            }

            if (rtl) {
                childBox.x1 = contentBox.x1;
                childBox.x2 = contentBox.x1 + thumbnailWidth;
            } else {
                childBox.x1 = contentBox.x2 - thumbnailWidth;
                childBox.x2 = contentBox.x2;
            }
            childBox.x1 -= indicatorLeftFullBorder;
            childBox.x2 += indicatorRightFullBorder;
            childBox.y1 = indicatorY1 - indicatorTopFullBorder;
            // passingthru67 - indicator needs to include caption
            //childBox.y2 = (indicatorY2 ? indicatorY2 : (indicatorY1 + thumbnailHeight)) + indicatorBottomFullBorder;
            childBox.y2 = (indicatorY2 ? indicatorY2 + captionBackgroundHeight : (indicatorY1 + thumbnailHeight + captionBackgroundHeight)) + indicatorBottomFullBorder;

            this._indicator.allocate(childBox, flags);
            
        }
    },

    // override addThumbnails to provide workspace thumbnail labels
    addThumbnails: function(start, count) {
        if (_DEBUG_) global.log("mythumbnailsBox: addThumbnails");
        for (let k = start; k < start + count; k++) {
            let metaWorkspace = global.screen.get_workspace_by_index(k);
            //let thumbnail = new WorkspaceThumbnail.WorkspaceThumbnail(metaWorkspace);
            let thumbnail = new myWorkspaceThumbnail(metaWorkspace, this._gsCurrentVersion, this._mySettings);
            thumbnail.setPorthole(this._porthole.x, this._porthole.y,
                                  this._porthole.width, this._porthole.height);
            
            
            // passingthru67 - workspace thumbnail labels
            // the following code adds captions to WorkspaceThumbnails
            if (this._mySettings.get_boolean('workspace-captions')) {
                
                let wsCaptionContainer = new St.Bin({
                    name: 'workspacestodockCaptionContainer',
                    reactive: false,
                    style_class: 'workspacestodock-workspace-caption-container',
                    x_fill: true,
                    y_align: St.Align.END,
                    x_align: St.Align.START
                });

                let wsCaptionBackground = new St.Bin({
                    name: 'workspacestodockCaptionBackground',
                    reactive: false,
                    style_class: 'workspacestodock-workspace-caption-background'
                });
                    
                let wsCaption = new St.BoxLayout({
                    name: 'workspacestodockCaption',
                    reactive: false,
                    style_class: 'workspacestodock-workspace-caption',
                    pack_start: true
                });

                let wsNumber = new St.Label({
                    name: 'workspacestodockCaptionNumber',
                    text: ''
                });
                let wsNumberBox = new St.BoxLayout({
                    name: 'workspacestodockCaptionNumberBox',
                    style_class: 'workspacestodock-caption-number'
                });
                wsNumberBox.add(wsNumber, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                
                let wsName = new St.Label({
                    name: 'workspacestodockCaptionName',
                    text: ''
                });
                let wsNameBox = new St.BoxLayout({
                    name: 'workspacestodockCaptionNameBox',
                    style_class: 'workspacestodock-caption-name'
                });
                wsNameBox.add(wsName, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});
                
                let wsWindowCount = new St.Label({
                    name: 'workspacestodockCaptionWindowCount',
                    text: ''
                });
                let wsWindowCountBox = new St.BoxLayout({
                    name: 'workspacestodockCaptionWindowCountBox',
                    style_class: 'workspacestodock-caption-windowcount'
                });
                wsWindowCountBox.add(wsWindowCount, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});

                let wsWindowAppsBox = new St.BoxLayout({
                    name: 'workspacestodockCaptionWindowApps',
                    reactive: false,
                    style_class: 'workspacestodock-caption-windowapps'
                });

                let wsSpacer = new St.Label({
                    name: 'workspacestodockCaptionSpacer',
                    text: ''
                });
                let wsSpacerBox = new St.BoxLayout({
                    name: 'workspacestodockCaptionSpacerBox',
                    style_class: 'workspacestodock-caption-spacer'
                });
                wsSpacerBox.add(wsSpacer, {x_fill: false, x_align: St.Align.MIDDLE, y_fill: false, y_align: St.Align.MIDDLE});

                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    wsWindowCountBox.remove_style_class_name("workspacestodock-caption-windowcount");
                    wsWindowCountBox.add_style_class_name("workspacestodock-caption-windowcount-image");
                }
                
                
                let currentItems = this._mySettings.get_strv('workspace-caption-items');

                for (let i = 0; i < currentItems.length; i++) {
                    let elements = currentItems[i].split(':');
                    let item = elements[0]
                    let expandState = (elements[1] == "true"? true: false);
                    
                    switch (item) {
                        case "number":
                            wsCaption.add(wsNumberBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                            //wsNumber.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            //wsNumberBox.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            break;
                        case "name":
                            wsCaption.add(wsNameBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                            //wsName.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            break;
                        case "windowcount":
                            wsCaption.add(wsWindowCountBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                            //wsWindowCount.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            break;
                        case "windowapps":
                            wsCaption.add(wsWindowAppsBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                            //wsWindowApps.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            wsWindowAppsBox.connect("realize", Lang.bind(this, this._initWindowApps, thumbnail));
                            thumbnail._wsWindowApps = wsWindowAppsBox;
                            break;
                        case "spacer":
                            wsCaption.add(wsSpacerBox, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END, expand: expandState});
                            //wsSpacer.add_constraint(new Clutter.BindConstraint({name: 'constraint', source: wsCaptionBackground, coordinate: Clutter.BindCoordinate.HEIGHT, offset: 0}));
                            break;
                    }
                    
                }

                wsCaptionContainer.add_actor(wsCaption);
                //thumbnail._wsCaption = wsCaption;
                //wsCaption.connect("realize", Lang.bind(this, this._initThumbnailCaptions, k));
                thumbnail.actor.add_actor(wsCaptionBackground);
                thumbnail.actor.add_actor(wsCaptionContainer);
                
                // Make thumbnail background transparent so that it doesn't show through
                // on edges where border-radius is set on caption
                thumbnail.actor.set_style("background-color: rgba(0,0,0,0.0)");
            }


            this._thumbnails.push(thumbnail);
            this.actor.add_actor(thumbnail.actor);
            
            

            if (start > 0) { // not the initial fill
                thumbnail.state = ThumbnailState.NEW;
                thumbnail.slidePosition = 1; // start slid out
                this._haveNewThumbnails = true;
            } else {
                thumbnail.state = ThumbnailState.NORMAL;
            }

            this._stateCounts[thumbnail.state]++;
        }

        this._queueUpdateStates();

        // The thumbnails indicator actually needs to be on top of the thumbnails
        this._indicator.raise_top();
    },

    _updateWindowCount: function(label, index) {
        let windows = global.get_window_actors();
        let tracker = Shell.WindowTracker.get_default();

        let className = "";
        let win_count = 0;
        let win_max = 4;
        for (let i = 0; i < windows.length; i++) {
            let win = windows[i].get_meta_window();
            if (tracker.is_window_interesting(win)) {
                let wksp_index = win.get_workspace().index();
                if (wksp_index == index && win.showing_on_its_workspace()) {
                    win_count ++;
                }
            }
        }

        if (!this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
            // clear box images
            let box = label.get_parent();
            if (box) {
                for(let i = 1; i <= win_max; i++){
                    let className = 'workspacestodock-caption-windowcount-image-'+i;
                    box.remove_style_class_name(className);
                }
            }
            
            // Set label text
            if (label) {
                if (win_count > 0) {
                    label.set_text(""+win_count);
                } else {
                    label.set_text("");
                }
            }
        } else {
            // clear label text
            if (label)
                label.set_text("");

            // Set background image class
            if (win_count > win_max)
                win_count = win_max;

            let box = label.get_parent();
            if (box) {
                for(let i = 1; i <= win_max; i++){
                    let className = 'workspacestodock-caption-windowcount-image-'+i;
                    if (i != win_count) {
                        box.remove_style_class_name(className);
                    } else {
                        box.add_style_class_name(className);
                    }
                }
            }
        }
    },
    
    _setThumbnailCaption: function(thumbnail, i, captionHeight, captionBackgroundHeight) {
        let unscale = 1/this._scale;
        let containerWidth = this._porthole.width * this._scale;
        let containerHeight = this._porthole.height * this._scale;

        let wsCaptionBackground = thumbnail.actor.get_child_at_index(1);
        if (!wsCaptionBackground)
            return;
            
        wsCaptionBackground.set_scale(unscale, unscale);
        //wsCaptionBackground.set_position(0, this._porthole.height + (6*unscale));
        wsCaptionBackground.set_position(0, this._porthole.height);
        wsCaptionBackground.set_size(containerWidth, captionBackgroundHeight);

        let wsCaptionContainer = thumbnail.actor.get_child_at_index(2);
        if (!wsCaptionContainer)
            return;

        wsCaptionContainer.set_scale(unscale, unscale);
        wsCaptionContainer.set_size(containerWidth, containerHeight + captionBackgroundHeight);
        //wsCaptionContainer.set_position(0, this._porthole.height);
        //wsCaptionContainer.set_size(containerWidth, captionBackgroundHeight);

        let wsCaption = wsCaptionContainer.find_child_by_name("workspacestodockCaption");
        if (!wsCaption)
            return;
            
        wsCaption.height = captionHeight; // constrains height to caption height
        
        let wsNumber = wsCaption.find_child_by_name("workspacestodockCaptionNumber");
        if (wsNumber) {
            wsNumber.set_text(""+(i+1));
            //wsNumber.height = captionBackgroundHeight - 2; // subtract 1px for workspacestodockCaptionContainer border and 1px for background border
            // TODO: check workspacestodockCaptionContainer theme for border values
            // TODO: check workspacestodockCaptionBackground theme for border values
        }
        let wsNumberBox = wsCaption.find_child_by_name("workspacestodockCaptionNumberBox");
        if (wsNumberBox)
            wsNumberBox.height = captionBackgroundHeight - 2;

        let wsName = wsCaption.find_child_by_name("workspacestodockCaptionName");
        if (wsName) {
            wsName.set_text(Meta.prefs_get_workspace_name(i));
            //wsName.height = captionBackgroundHeight - 2; // subtract 1px for workspacestodockCaptionContainer border and 1px for background border
            // TODO: check workspacestodockCaptionContainer theme for border values
            // TODO: check workspacestodockCaptionBackground theme for border values
        }
        let wsNameBox = wsCaption.find_child_by_name("workspacestodockCaptionNameBox");
        if (wsNameBox)
            wsNameBox.height = captionBackgroundHeight - 2;

        let wsWindowCount = wsCaption.find_child_by_name("workspacestodockCaptionWindowCount");
        if (wsWindowCount) {
            this._updateWindowCount(wsWindowCount, i);
            //wsWindowCount.height = captionBackgroundHeight - 2; // subtract 1px for workspacestodockCaptionContainer border and 1px for background border
            // TODO: check workspacestodockCaptionContainer theme for border values
            // TODO: check workspacestodockCaptionBackground theme for border values
        }
        let wsWindowCountBox = wsCaption.find_child_by_name("workspacestodockCaptionWindowCountBox");
        if (wsWindowCountBox)
            wsWindowCountBox.height = captionBackgroundHeight - 2;

        let wsWindowAppsBox = wsCaption.find_child_by_name("workspacestodockCaptionWindowApps");
        if (wsWindowAppsBox) {
            wsWindowAppsBox.height = captionHeight;
        }
        
        let wsSpacerBox = wsCaption.find_child_by_name("workspacestodockCaptionSpacerBox");

        if (i == global.screen.get_active_workspace_index()) {
            if (wsCaptionBackground) wsCaptionBackground.add_style_class_name('workspacestodock-workspace-caption-background-current');
            if (wsCaption) wsCaption.add_style_class_name('workspacestodock-workspace-caption-current');
            if (wsNumberBox) wsNumberBox.add_style_class_name('workspacestodock-caption-number-current');
            if (wsNameBox) wsNameBox.add_style_class_name('workspacestodock-caption-name-current');
            if (wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (wsSpacerBox) wsSpacerBox.add_style_class_name('workspacestodock-caption-spacer-current');
        } else {
            if (wsCaptionBackground) wsCaptionBackground.remove_style_class_name('workspacestodock-workspace-caption-background-current');
            if (wsCaption) wsCaption.remove_style_class_name('workspacestodock-workspace-caption-current');
            if (wsNumberBox) wsNumberBox.remove_style_class_name('workspacestodock-caption-number-current');
            if (wsNameBox) wsNameBox.remove_style_class_name('workspacestodock-caption-name-current');
            if (wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (wsSpacerBox) wsSpacerBox.remove_style_class_name('workspacestodock-caption-spacer-current');
        }

    },
    
    //_initThumbnailCaptions: function(actor, wkspIndex) {
        //if (_DEBUG_) global.log("myWorkspaceThumbnail: _initThumbnailCaptions");
        //let caption = actor;
        //let themeNode = caption.get_theme_node();
        
        //// Get caption top and bottom border width
        //let topBorderWidth = themeNode.get_border_width(St.Side.TOP);
        //let bottomBorderWidth = themeNode.get_border_width(St.Side.BOTTOM);
        
        //// Set constraint offsets of caption items to negative
        //// a negative constraint offset acts as bottom padding to align items with bottom border of caption
        ////let childOffset = (topBorderWidth + bottomBorderWidth) * -1;
        
        ////let children = caption.get_children();
        ////for (let i = 0; i < children.length; i++) {
            ////if (_DEBUG_) global.log("child["+i+"] name = "+children[i].get_name());
            ////let constraint = children[i].get_constraint('constraint');
            ////if (children[i].get_name() == "workspacestodockCaptionWindowApps") {
            ////    if (_DEBUG_) global.log("found");
            ////    //constraint.set_offset(-2);
            ////} else {
            ////    constraint.set_offset(childOffset);
            ////}
        ////}

        //let i = wkspIndex;

        //let wsNumber = caption.find_child_by_name("workspacestodockCaptionNumber");
        //if (wsNumber) {
            //wsNumber.set_text(""+i);
        //}
        //let wsName = caption.find_child_by_name("workspacestodockCaptionName");
        //if (wsName) {
            //wsName.set_text(Meta.prefs_get_workspace_name(i));
        //}

        //let wsWindowCount = caption.find_child_by_name("workspacestodockCaptionWindowCount");
        //if (wsWindowCount) {
            //this._updateWindowCount(wsWindowCount, i);
        //}
        
    //},
    
    _initWindowApps: function(actor, thumbnail) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps wsp="+thumbnail.metaWorkspace);
        // Create initial buttons for windows on workspace
        let wsWindowApps = actor;
        let windows;
        if (this._gsCurrentVersion[1] < 7) {
            windows = global.get_window_actors().filter(thumbnail._isWorkspaceWindow, thumbnail);
        } else {
            windows = global.get_window_actors().filter(Lang.bind(this, function(actor) {
                let win = actor.meta_window;
                return win.located_on_workspace(thumbnail.metaWorkspace);
            }));
        }
        //let windows = global.get_window_actors();
        //let workspace = global.screen.get_active_workspace();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            if (thumbnail._isMyWindow(windows[i]) && thumbnail._isOverviewWindow(windows[i])) {
                let metaWin = windows[i].get_meta_window();
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - add window buttons");
                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(metaWin);
                if (app) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: _initWindowApps - window button app = "+app.get_name());
                    //let icon = new AppDisplay.AppIcon(app, {setSizeManually: true, showLabel: false});
                    let iconParams = {setSizeManually: true, showLabel: false};
                    iconParams['createIcon'] = Lang.bind(this, function(iconSize){ return app.create_icon_texture(iconSize);});
                    
                    let icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
                    icon.actor.add_style_class_name('workspacestodock-caption-windowapps-button-icon');
                    if (this._mySettings.get_boolean('workspace-caption-large-icons')) {
                        icon.setIconSize(CAPTION_APP_ICON_LARGE_SIZE);
                    } else {
                        icon.setIconSize(CAPTION_APP_ICON_NORMAL_SIZE);
                    }

                    let button;
                    if (this._gsCurrentVersion[1] < 6) {
                        button = new St.Button({style_class:'workspacestodock-caption-windowapps-button'});
                    } else {
                        button = new St.Button({style_class:'app-well-app workspacestodock-caption-windowapps-button'});
                    }
                    button.set_child(icon.actor);
                    button.connect('button-release-event', Lang.bind(this, thumbnail._onWindowAppsButtonClick, thumbnail, metaWin));
                    button.connect('enter-event', Lang.bind(this, thumbnail._onWindowAppsButtonEnter, icon));
                    button.connect('leave-event', Lang.bind(this, thumbnail._onWindowAppsButtonLeave, icon));
                    
                    if (metaWin.has_focus()) {
                        if (this._gsCurrentVersion[1] > 4)
                            button.add_style_class_name('popup-menu-item');
                        button.add_style_pseudo_class('active');
                    }
                    
                    let winInfo = {};
                    winInfo.metaWin = metaWin;
                    winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', Lang.bind(this, thumbnail._onWindowChanged, metaWin));
                    wsWindowApps.add(button, {x_fill: false, x_align: St.Align.START, y_fill: false, y_align: St.Align.END});
                    thumbnail._wsWindowAppsButtons.push(winInfo);
                }
            }
        }
    }

    
});
