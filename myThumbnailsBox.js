/* ========================================================================================================
 * myThumbnailsBox.js - thumbnailsbox object
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  Part of this code was copied from the gnome-shell-extensions framework
 *  http://git.gnome.org/browse/gnome-shell-extensions/
  * ========================================================================================================
 */

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

// The maximum size of a thumbnail is 1/8 the width and height of the screen
let MAX_THUMBNAIL_SCALE = 1/8.;

const RESCALE_ANIMATION_TIME = 0.2;
const SLIDE_ANIMATION_TIME = 0.2;

// When we create workspaces by dragging, we add a "cut" into the top and
// bottom of each workspace so that the user doesn't have to hit the
// placeholder exactly.
const WORKSPACE_CUT_SIZE = 10;

const WORKSPACE_KEEP_ALIVE_TIME = 100;

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

const myThumbnailsBox = new Lang.Class({
    Name: 'workspacesToDock.myThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(gsCurrentVersion, settings) {
        this.parent();
        this._gsCurrentVersion = gsCurrentVersion;
        this._settings = settings;
    },

	// override _onButtonRelease to provide overview on right click
    _onButtonRelease: function(actor, event) {
        if (this._settings.get_boolean('toggle-overview')) {
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
                thumbnail.activate(event.time);
                break;
            }
        }
        return true;

    },

    // override _activeWorkspaceChanged to eliminate errors thrown
    _activeWorkspaceChanged: function(wm, from, to, direction) {
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
        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._animatingIndicator = true;
                this.indicatorY = this._indicator.allocation.y1;
                break;
            case"6":
                this._animatingIndicator = true;
                let indicatorThemeNode = this._indicator.get_theme_node();
                let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
                this.indicatorY = this._indicator.allocation.y1 + indicatorTopFullBorder;
                break;
            default:
                throw new Error("Unknown version number (myThumbnailsBox.js).");
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
        global.log("*thumbnailbox allocate triggered");
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
        if (this._settings.get_boolean('workspace-captions'))
            captionHeight = 20;
        
        spacing = spacing + captionHeight;
        
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
        switch (this._gsCurrentVersion[1]) {
            case"4":
            
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
                        //childBox.y2 = y1 + portholeHeight;
                        // passingthru67 - size needs to include caption area
                        childBox.y2 = y1 + portholeHeight + (captionHeight/roundedVScale);

                        thumbnail.actor.set_scale(roundedHScale, roundedVScale);
                        thumbnail.actor.allocate(childBox, flags);

                        // passingthru67 - set WorkspaceThumbnail labels
                        if (this._settings.get_boolean('workspace-captions'))
                            this._setThumbnailCaption(thumbnail, i, thumbnailWidth, thumbnailHeight, captionHeight, roundedHScale, roundedVScale);

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
                    childBox.y2 = childBox.y1 + thumbnailHeight + captionHeight - 2; // the -2 adjusts for wsNumber, wsName, wsWindowcount, wsSpacer -2 offsets in addThumbnails function
                    this._indicator.allocate(childBox, flags);
            
            
                break;
            case"6":
            
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
                        //childBox.y2 = y1 + portholeHeight;
                        // passingthru67 - size needs to include caption area
                        childBox.y2 = y1 + portholeHeight + (captionHeight/roundedVScale);

                        thumbnail.actor.set_scale(roundedHScale, roundedVScale);
                        thumbnail.actor.allocate(childBox, flags);


                        // passingthru67 - set WorkspaceThumbnail labels
                        if (this._settings.get_boolean('workspace-captions'))
                            this._setThumbnailCaption(thumbnail, i, thumbnailWidth, thumbnailHeight, captionHeight, roundedHScale, roundedVScale);
                        
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
                    //childBox.y2 = (indicatorY2 ? indicatorY2 : (indicatorY1 + thumbnailHeight)) + indicatorBottomFullBorder;
                    // passingthru67 - indicator needs to include caption
                    childBox.y2 = (indicatorY2 ? indicatorY2 + captionHeight - 2 : (indicatorY1 + thumbnailHeight + captionHeight - 2)) + indicatorBottomFullBorder; // the -2 adjusts for wsNumber, wsName, wsWindowcount, wsSpacer -2 offsets in addThumbnails function

                    this._indicator.allocate(childBox, flags);
            
            
                break;
            default:
                throw new Error("Unknown version number (myThumbnailsBox.js).");
        } // END SWITCH

    },

    // override addThumbnails to provide workspace thumbnail labels
    addThumbnails: function(start, count) {
        global.log("addThumbnails");
        for (let k = start; k < start + count; k++) {
            let metaWorkspace = global.screen.get_workspace_by_index(k);
            let thumbnail = new WorkspaceThumbnail.WorkspaceThumbnail(metaWorkspace);
            thumbnail.setPorthole(this._porthole.x, this._porthole.y,
                                  this._porthole.width, this._porthole.height);
            
            
            // passingthru67 - workspace thumbnail labels
            // the following code adds captions to WorkspaceThumbnails
            if (this._settings.get_boolean('workspace-captions')) {
                
                let wsCaptionContainer = new St.Bin({
                    name: 'workspacestodockCaptionContainer',
                    reactive: false,
                    x_fill: true,
                    y_align: St.Align.END,
                    x_align: St.Align.START
                });

                let wsCaption = new St.BoxLayout({
                    name: 'workspacestodockCaption',
                    reactive: false,
                    style_class: 'workspacestodock-workspace-caption',
                    pack_start: true
                });

                let wsNumber = new St.Label({
                    name: 'workspacestodockCaptionNumber',
                    text: '',
                    style_class: 'workspacestodock-caption-number'
                });
                let wsName = new St.Label({
                    name: 'workspacestodockCaptionName',
                    text: '',
                    style_class: 'workspacestodock-caption-name'
                });
                let wsWindowCount = new St.Label({
                    name: 'workspacestodockCaptionWindowCount',
                    text: '',
                    style_class: 'workspacestodock-caption-windowcount'
                });
                let wsSpacer = new St.Label({
                    name: 'workspacestodockCaptionSpacer',
                    text: '',
                    style_class: 'workspacestodock-caption-spacer'
                });

                if (this._settings.get_boolean('workspace-caption-windowcount-image')) {
                    wsWindowCount.remove_style_class_name("workspacestodock-caption-windowcount");
                    wsWindowCount.add_style_class_name("workspacestodock-caption-windowcount-image");
                }
                
                
                let currentItems = this._settings.get_strv('workspace-caption-items');

                for (i = 0; i < currentItems.length; i++) {
                    let elements = currentItems[i].split(':');
                    let item = elements[0]
                    let expandState = (elements[1] == "true"? true: false);
                    
                    switch (item) {
                        case "number":
                            wsCaption.add(wsNumber, {x_align: St.Align.END, expand: expandState});
                            wsNumber.add_constraint(new Clutter.BindConstraint({source: wsCaption, coordinate: Clutter.BindCoordinate.HEIGHT, offset: -2})); // negative offset acts as bottom padding to show bottom border of number label
                            break;
                        case "name":
                            wsCaption.add(wsName, {x_align: St.Align.END, expand: expandState});
                            wsName.add_constraint(new Clutter.BindConstraint({source: wsCaption, coordinate: Clutter.BindCoordinate.HEIGHT, offset: -2})); // negative offset acts as bottom padding to show bottom border of name label
                            break;
                        case "windowcount":
                            wsCaption.add(wsWindowCount, {x_align: St.Align.END, expand: expandState});
                            wsWindowCount.add_constraint(new Clutter.BindConstraint({source: wsCaption, coordinate: Clutter.BindCoordinate.HEIGHT, offset: -2})); // negative offset acts as bottom padding to show bottom border of windowcount label
                            break;
                        case "spacer":
                            wsCaption.add(wsSpacer, {x_align: St.Align.END, expand: expandState});
                            wsSpacer.add_constraint(new Clutter.BindConstraint({source: wsCaption, coordinate: Clutter.BindCoordinate.HEIGHT, offset: -2})); // negative offset acts as bottom padding to show bottom border of spacer label
                            break;
                    }
                    
                }

                wsCaptionContainer.add_actor(wsCaption);
                wsCaptionContainer.set_style("padding: 0px 0px 1px 0px"); // bottom padding needed to show bottom border of caption (gets cut off by 1px due to _allocate design)
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

        if (!this._settings.get_boolean('workspace-caption-windowcount-image')) {
            // clear label images
            for(let i = 1; i <= win_max; i++){
                let className = 'workspacestodock-caption-windowcount-image-'+i;
                label.remove_style_class_name(className);
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
            label.set_text("");

            // Set background image class
            if (win_count > win_max)
                win_count = win_max;

            if (label) {
                for(let i = 1; i <= win_max; i++){
                    let className = 'workspacestodock-caption-windowcount-image-'+i;
                    if (i != win_count) {
                        label.remove_style_class_name(className);
                    } else {
                        label.add_style_class_name(className);
                    }
                }
            }
        }
    },
    
    _setThumbnailCaption: function(thumbnail, i, thumbnailWidth, thumbnailHeight, captionHeight, roundedHScale, roundedVScale) {
        let wsCaptionContainer = thumbnail.actor.get_child_at_index(1);
        wsCaptionContainer.set_scale(1/roundedHScale, 1/roundedVScale);
        wsCaptionContainer.set_size(thumbnailWidth, thumbnailHeight + captionHeight);

        let wsCaption = wsCaptionContainer.get_child_at_index(0);
        wsCaption.height = captionHeight; // constrains height to caption height

        let wsNumber = wsCaption.find_child_by_name("workspacestodockCaptionNumber");
        if (wsNumber)
            wsNumber.set_text(""+(i+1));
        
        let wsName = wsCaption.find_child_by_name("workspacestodockCaptionName");
        if (wsName)
            wsName.set_text(Meta.prefs_get_workspace_name(i));

        let wsWindowCount = wsCaption.find_child_by_name("workspacestodockCaptionWindowCount");
        if (wsWindowCount)
            this._updateWindowCount(wsWindowCount, i);
        
        let wsSpacer = wsCaption.find_child_by_name("workspacestodockCaptionSpacer");    

        if (i == global.screen.get_active_workspace_index()) {
            wsCaption.add_style_class_name('workspacestodock-workspace-caption-current');
            wsNumber.add_style_class_name('workspacestodock-caption-number-current');
            wsName.add_style_class_name('workspacestodock-caption-name-current');
            wsWindowCount.add_style_class_name('workspacestodock-caption-windowcount-current');
            wsSpacer.add_style_class_name('workspacestodock-caption-spacer-current');
        } else {
            wsCaption.remove_style_class_name('workspacestodock-workspace-caption-current');
            wsNumber.remove_style_class_name('workspacestodock-caption-number-current');
            wsName.remove_style_class_name('workspacestodock-caption-name-current');
            wsWindowCount.remove_style_class_name('workspacestodock-caption-windowcount-current');
            wsSpacer.remove_style_class_name('workspacestodock-caption-spacer-current');
        }

    }

    
});
