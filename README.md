workspaces-to-dock
==================

A Gnome Shell extension that transforms the workspaces of the overview mode into an intellihide dock.  The dock is positioned and sized to maintain tight integration with the Gnome Shell.


Installation
------------
The easiest way to install Workspaces-to-Dock is from https://extensions.gnome.org/extension/427/workspaces-to-dock/

Otherwise, you may download the .zip file from the Downloads page (https://github.com/passingthru67/workspaces-to-dock/downloads) or checkout the code from the master branch.

If you have the .zip file, go to Gnome Tweak tools --> Shell Extensions --> Install from zip file --> choose the zip file.

If you have the source code, rename the folder and copy it to the appropriate place:

	$ cp workspaces-to-dock@passingthru67@gmail.com ~/.local/share/gnome-shell/extensions/

Configure using `gnome-shell-extension-prefs`. No shell restarts required.


Changelog:
----------
v3

- Reworked the code for adding/removing workspaces. Not only fixed the firefox issue, but also made displaying workspaces smoother and more consistant with Gnome Shell behavior.
- Intellihide enhancement added to dodge resulting icons from Gnome Shell search panel.

v2

- Scrolling the mouse wheel over the dock now switches workspaces.
- Intellihide enhancements added to dodge Gnome Shell panel and messsagetray popup menus.

v1

- Initial extension based on the dash-to-dock v10 code (https://github.com/micheleg/dash-to-dock).


Features Planned:
-----------------
- RTL support
- Better stationary/fixed dock support
- Preferences option to choose which monitor to place workspaces dock onto


Issues:
-------

If you run into any strange behavior with dynamic workspaces, please disable the extension, restart Gnome Shell, and test again to see if the behavior can be replicated.

**Some causes of strange workspace behavior:**

- Letting Nautilus file manager handle the desktop  (this is an option in Gnome Tweak Tool).
- Using dual monitors. If you are using dual monitors, it is recommended that you turn off the workspaces-only-on-primary option under org->gnome->shell->overrides (use dconf-editor). Gnome Shell 3.4 seems buggy when using dual monitors in general, but worse with this option on.

