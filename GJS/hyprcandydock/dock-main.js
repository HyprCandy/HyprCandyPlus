#!/usr/bin/env gjs

// HyprCandy Dock - GTK4 Layer Shell Dock
// Replaces nwg-dock-hyprland with modern GTK4/GJS implementation
// Features: hot color reloading, glyph icons, popover menus, Hyprland socket IPC

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';

const { Gtk, Gdk, Gio, GLib, GObject } = imports.gi;
const Gtk4LayerShell = imports.gi.Gtk4LayerShell;

// Script directory for imports
const SCRIPT_DIR = GLib.path_get_dirname(imports.system.programInvocationName);
imports.searchPath.unshift(SCRIPT_DIR);
imports.searchPath.unshift(GLib.build_filenamev([SCRIPT_DIR, '..', 'src']));

const Daemon = imports.daemon.Daemon;

// --- Dock configuration -----------------------------------------------
const ICON_SIZE = 22;
const INDICATOR_FONT_SIZE = 4;
const BUTTON_PADDING = 4;
const DOCK_SPACING = 2;

// Glyph icons (Nerd Font codepoints)
const GLYPH_START = '\uF17C';
const GLYPH_INDICATOR = '\u{F09DF}';
const GLYPH_TRASH = '\u{F0A5A}';

// Color CSS paths
const HOME = GLib.get_home_dir();
const GTK4_COLORS_PATH = GLib.build_filenamev([HOME, '.config', 'gtk-4.0', 'colors.css']);
const GTK3_COLORS_PATH = GLib.build_filenamev([HOME, '.config', 'gtk-3.0', 'colors.css']);
const DOCK_STYLE_PATH = GLib.build_filenamev([HOME, '.hyprcandy', 'GJS', 'hyprcandydock', 'style.css']);
const LOCAL_STYLE_PATH = GLib.build_filenamev([SCRIPT_DIR, 'style.css']);

// --- CSS Hot Reload ---------------------------------------------------
let cssProviders = [];
let reloadPending = false;
let matugenCheckId = null;
let fileMonitors = [];
let dockWindow = null;

function isMatugenRunning() {
    try {
        const [ok, stdout, , status] = GLib.spawn_command_line_sync('pgrep -x matugen');
        return ok && status === 0 && stdout.toString().trim().length > 0;
    } catch (e) {
        return false;
    }
}

function performCSSReload() {
    if (reloadPending) return;
    reloadPending = true;

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        try {
            print('[dock] Reloading theme colors...');
            const display = Gdk.Display.get_default();

            // Remove old providers
            for (const provider of cssProviders) {
                try {
                    Gtk.StyleContext.remove_provider_for_display(display, provider);
                } catch (e) { /* ignore */ }
            }
            cssProviders = [];

            // Reload GTK3 colors (matugen named colors)
            if (GLib.file_test(GTK3_COLORS_PATH, GLib.FileTest.EXISTS)) {
                const gtk3Provider = new Gtk.CssProvider();
                gtk3Provider.load_from_path(GTK3_COLORS_PATH);
                Gtk.StyleContext.add_provider_for_display(display, gtk3Provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
                cssProviders.push(gtk3Provider);
            }

            // Reload GTK4 colors
            if (GLib.file_test(GTK4_COLORS_PATH, GLib.FileTest.EXISTS)) {
                const gtk4Provider = new Gtk.CssProvider();
                gtk4Provider.load_from_path(GTK4_COLORS_PATH);
                Gtk.StyleContext.add_provider_for_display(display, gtk4Provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
                cssProviders.push(gtk4Provider);
            }

            // Reload dock style (user override first, then local fallback)
            const stylePath = GLib.file_test(DOCK_STYLE_PATH, GLib.FileTest.EXISTS)
                ? DOCK_STYLE_PATH
                : LOCAL_STYLE_PATH;
            if (GLib.file_test(stylePath, GLib.FileTest.EXISTS)) {
                const styleProvider = new Gtk.CssProvider();
                styleProvider.load_from_path(stylePath);
                Gtk.StyleContext.add_provider_for_display(display, styleProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                cssProviders.push(styleProvider);
            }

            // Refresh the dock window
            if (dockWindow && dockWindow.get_visible()) {
                dockWindow.queue_draw();
            }

            print('[dock] Theme colors hot-reloaded');
        } catch (e) {
            print('[dock] CSS reload error: ' + e.message);
        } finally {
            reloadPending = false;
        }
        return false;
    });
}

function waitForMatugenAndReload() {
    if (matugenCheckId) {
        GLib.source_remove(matugenCheckId);
        matugenCheckId = null;
    }

    if (!isMatugenRunning()) {
        performCSSReload();
        return;
    }

    print('[dock] Matugen running, waiting...');
    matugenCheckId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 300, () => {
        if (!isMatugenRunning()) {
            matugenCheckId = null;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 100, () => {
                performCSSReload();
                return false;
            });
            return false;
        }
        return true;
    });
}

function setupFileMonitors() {
    const pathsToWatch = [GTK4_COLORS_PATH, GTK3_COLORS_PATH, DOCK_STYLE_PATH, LOCAL_STYLE_PATH];

    for (const path of pathsToWatch) {
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) continue;
        try {
            const file = Gio.File.new_for_path(path);
            const monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            monitor.connect('changed', () => {
                print('[dock] CSS change detected: ' + GLib.path_get_basename(path));
                waitForMatugenAndReload();
            });
            fileMonitors.push(monitor);
            print('[dock] Monitoring: ' + GLib.path_get_basename(path));
        } catch (e) {
            print('[dock] Monitor error for ' + path + ': ' + e.message);
        }
    }
}

function cleanupMonitors() {
    if (matugenCheckId) {
        GLib.source_remove(matugenCheckId);
        matugenCheckId = null;
    }
    for (const mon of fileMonitors) {
        try { mon.cancel(); } catch (e) { /* ignore */ }
    }
    fileMonitors = [];
}

// --- SIGUSR1 handler for manual hot refresh ---------------------------
function setupSignalHandler() {
    try {
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 10, () => {
            print('[dock] SIGUSR1 received - hot refreshing...');
            performCSSReload();
            return true;
        });
        print('[dock] SIGUSR1 handler registered');
    } catch (e) {
        print('[dock] Could not register SIGUSR1 handler: ' + e.message);
    }
}

// --- Dock Widget ------------------------------------------------------
const HyprCandyDock = GObject.registerClass({
    GTypeName: 'HyprCandyDock',
}, class HyprCandyDock extends Gtk.ApplicationWindow {
    _init(app) {
        super._init({
            application: app,
            title: 'HyprCandy Dock',
            decorated: false,
        });

        this.daemon = new Daemon(this);
        this.clientWidgets = new Map();
        this._startSeparator = null;
        this._endSeparator = null;
        this._trashButton = null;

        this.setupLayerShell();
        this.createDock();
        this.initializeDock();
    }

    setupLayerShell() {
        Gtk4LayerShell.init_for_window(this);
        Gtk4LayerShell.set_namespace(this, 'hyprcandy-dock');
        Gtk4LayerShell.set_layer(this, Gtk4LayerShell.Layer.OVERLAY);

        // Anchor bottom only - dock floats at bottom center
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.BOTTOM, true);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.LEFT, false);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.RIGHT, false);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.TOP, false);

        // Exclusive zone: reserve space for dock
        Gtk4LayerShell.set_exclusive_zone(this, 40);

        // Margins from screen edge
        Gtk4LayerShell.set_margin(this, Gtk4LayerShell.Edge.BOTTOM, 6);

        print('[dock] Layer shell configured');
    }

    createDock() {
        this.mainBox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 0);
        this.mainBox.set_name('dock-box');
        this.mainBox.set_halign(Gtk.Align.CENTER);
        this.mainBox.set_valign(Gtk.Align.END);

        this.set_child(this.mainBox);
        print('[dock] Dock container created');
    }

    async initializeDock() {
        // Build layout: Start | Separator | [apps] | Separator | Trash
        this._addStartButton();
        this._addSeparator('start');

        // Load running apps
        await this.daemon.loadInitialClients();
        this.daemon.startEventMonitoring();

        this._addSeparator('end');
        this._addTrashButton();

        this.show();
        print('[dock] Dock initialized');
    }

    // --- Start button -------------------------------------------------
    _addStartButton() {
        const btn = Gtk.Button.new();
        btn.add_css_class('dock-button');
        btn.add_css_class('start-button');

        const label = Gtk.Label.new(GLYPH_START);
        label.set_name('start-icon');
        btn.set_child(label);
        btn.set_tooltip_text('Applications');

        // Left click -> rofi
        btn.connect('clicked', () => {
            GLib.spawn_command_line_async('rofi -show drun');
        });

        // Right click -> start menu popover
        const gesture = new Gtk.GestureClick();
        gesture.set_button(3);
        gesture.connect('pressed', () => {
            this._showStartMenu(btn);
        });
        btn.add_controller(gesture);

        this.mainBox.append(btn);
    }

    _showStartMenu(parentButton) {
        const popover = new Gtk.Popover();
        popover.set_parent(parentButton);
        popover.set_has_arrow(false);
        popover.add_css_class('dock-popover');

        const menuBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 2);
        menuBox.set_margin_start(6);
        menuBox.set_margin_end(6);
        menuBox.set_margin_top(6);
        menuBox.set_margin_bottom(6);

        const items = [
            { label: 'Applications', cmd: 'rofi -show drun' },
            { label: 'Files', cmd: 'nautilus' },
            { label: 'Terminal', cmd: 'kitty' },
            { label: 'Settings', cmd: 'gnome-control-center' },
        ];

        for (const item of items) {
            const btn = Gtk.Button.new_with_label(item.label);
            btn.add_css_class('popover-item');
            btn.set_halign(Gtk.Align.FILL);
            btn.connect('clicked', () => {
                GLib.spawn_command_line_async(item.cmd);
                popover.popdown();
            });
            menuBox.append(btn);
        }

        popover.set_child(menuBox);
        popover.popup();
    }

    // --- Separators ---------------------------------------------------
    _addSeparator(tag) {
        const sep = Gtk.Separator.new(Gtk.Orientation.VERTICAL);
        sep.set_name('separator-' + tag);
        this.mainBox.append(sep);
        if (tag === 'start') this._startSeparator = sep;
        if (tag === 'end') this._endSeparator = sep;
    }

    // --- Trash button -------------------------------------------------
    _addTrashButton() {
        const btn = Gtk.Button.new();
        btn.add_css_class('dock-button');
        btn.add_css_class('trash-button');

        const label = Gtk.Label.new(GLYPH_TRASH);
        label.set_name('trash-icon');
        btn.set_child(label);
        btn.set_tooltip_text('Trash');

        btn.connect('clicked', () => {
            GLib.spawn_command_line_async('nautilus trash:///');
        });

        this._trashButton = btn;
        this.mainBox.append(btn);
    }

    // --- App buttons (incremental update from daemon) -----------------
    updateFromDaemon(clientData) {
        const currentClasses = new Set(this.clientWidgets.keys());
        const newClasses = new Set(clientData.map(d => d.className));

        // Remove widgets for apps no longer present
        for (const className of currentClasses) {
            if (!newClasses.has(className)) {
                const widget = this.clientWidgets.get(className);
                if (widget) {
                    this.mainBox.remove(widget);
                    this.clientWidgets.delete(className);
                    print('[dock] Removed: ' + className);
                }
            }
        }

        // Add or update widgets
        for (const data of clientData) {
            if (!this.clientWidgets.has(data.className)) {
                this._addClientButton(data);
            } else {
                this._updateClientButton(data);
            }
        }

        // Reorder: ensure end separator and trash stay last
        if (this._endSeparator) {
            this.mainBox.reorder_child_after(this._endSeparator, this._getLastAppWidget());
        }
        if (this._trashButton) {
            this.mainBox.reorder_child_after(this._trashButton, this._endSeparator);
        }
    }

    _getLastAppWidget() {
        let last = this._startSeparator;
        for (const [, widget] of this.clientWidgets) {
            last = widget;
        }
        return last;
    }

    _addClientButton(data) {
        // Vertical container: icon button on top, indicator at bottom edge
        const container = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        container.set_halign(Gtk.Align.CENTER);
        container.set_valign(Gtk.Align.END);
        container.add_css_class('app-container');

        // Icon button
        const btn = Gtk.Button.new();
        btn.add_css_class('dock-button');
        btn.add_css_class('app-button');
        btn.set_name('app-' + data.className);

        const icon = Gtk.Image.new_from_icon_name(this.daemon.getIcon(data.className));
        icon.set_pixel_size(ICON_SIZE);
        icon.set_halign(Gtk.Align.CENTER);
        btn.set_child(icon);

        // Tooltip with instance count
        const tooltipText = data.instances.length > 1
            ? data.className + ' (' + data.instances.length + ')'
            : data.className;
        btn.set_tooltip_text(tooltipText);

        // Left click -> focus first instance
        btn.connect('clicked', () => {
            if (data.instances.length > 0) {
                this.daemon.focusWindow(data.instances[0].address);
            }
        });

        // Right click -> context menu
        const gesture = new Gtk.GestureClick();
        gesture.set_button(3);
        gesture.connect('pressed', () => {
            this._showContextMenu(data, btn);
        });
        btn.add_controller(gesture);

        // Active indicator glyph on bottom edge
        const indicator = Gtk.Label.new('');
        indicator.set_name('active-indicator');
        indicator.add_css_class('active-indicator');
        indicator.set_halign(Gtk.Align.CENTER);
        indicator.set_valign(Gtk.Align.END);

        const instanceCount = data.instances ? data.instances.length : 0;
        if (instanceCount > 0) {
            indicator.set_text(GLYPH_INDICATOR.repeat(Math.min(instanceCount, 2)));
        }

        container.append(btn);
        container.append(indicator);

        // Insert before end separator
        if (this._endSeparator) {
            this.mainBox.insert_child_after(container, this._getLastAppWidget());
        } else {
            this.mainBox.append(container);
        }

        this.clientWidgets.set(data.className, container);
    }

    _updateClientButton(data) {
        const container = this.clientWidgets.get(data.className);
        if (!container) return;

        // Update tooltip on button (first child)
        const btn = container.get_first_child();
        if (btn) {
            const tooltipText = data.instances.length > 1
                ? data.className + ' (' + data.instances.length + ')'
                : data.className;
            btn.set_tooltip_text(tooltipText);
        }

        // Update indicator (second child)
        const indicator = btn ? btn.get_next_sibling() : null;
        if (indicator) {
            const instanceCount = data.instances ? data.instances.length : 0;
            if (instanceCount > 0) {
                indicator.set_text(GLYPH_INDICATOR.repeat(Math.min(instanceCount, 2)));
            } else {
                indicator.set_text('');
            }
        }
    }

    // --- Context Menu (popover) ---------------------------------------
    _showContextMenu(data, parentButton) {
        const popover = new Gtk.Popover();
        popover.set_parent(parentButton);
        popover.set_has_arrow(false);
        popover.add_css_class('dock-popover');

        const menuBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        menuBox.set_margin_start(6);
        menuBox.set_margin_end(6);
        menuBox.set_margin_top(6);
        menuBox.set_margin_bottom(6);

        // Per-instance entries
        data.instances.forEach((instance, idx) => {
            // Instance header: icon + title (workspace)
            const headerBox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 6);

            const instanceIcon = Gtk.Image.new_from_icon_name(this.daemon.getIcon(data.className));
            instanceIcon.set_pixel_size(16);
            headerBox.append(instanceIcon);

            const title = instance.title.length > 30
                ? instance.title.substring(0, 30) + '...'
                : instance.title;
            const wsName = instance.workspace
                ? (instance.workspace.name || instance.workspace.id || '?')
                : '?';
            const headerLabel = Gtk.Label.new(title + ' (' + wsName + ')');
            headerLabel.set_halign(Gtk.Align.START);
            headerLabel.set_hexpand(true);
            headerBox.append(headerLabel);

            // Focus button for this instance
            const focusBtn = Gtk.Button.new();
            focusBtn.set_child(headerBox);
            focusBtn.add_css_class('popover-item');
            focusBtn.set_halign(Gtk.Align.FILL);
            focusBtn.set_hexpand(true);
            focusBtn.connect('clicked', () => {
                this.daemon.focusWindow(instance.address);
                popover.popdown();
            });

            // Expandable actions submenu per instance
            const actionsBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
            actionsBox.set_margin_start(12);
            actionsBox.visible = false;

            // Window actions
            const windowActions = [
                { label: 'Close Window', fn: () => this.daemon.closeWindow(instance.address) },
                { label: 'Toggle Floating', fn: () => this.daemon.hyprctl('dispatch togglefloating address:' + instance.address) },
                { label: 'Fullscreen', fn: () => this.daemon.hyprctl('dispatch fullscreen address:' + instance.address) },
            ];

            for (const wa of windowActions) {
                const actionBtn = Gtk.Button.new_with_label(wa.label);
                actionBtn.add_css_class('popover-item');
                actionBtn.add_css_class('popover-action');
                actionBtn.set_halign(Gtk.Align.FILL);
                actionBtn.connect('clicked', () => {
                    wa.fn();
                    popover.popdown();
                });
                actionsBox.append(actionBtn);
            }

            // Move to workspace submenu
            const wsMenuLabel = Gtk.Label.new('Move to Workspace');
            wsMenuLabel.set_halign(Gtk.Align.START);
            wsMenuLabel.add_css_class('popover-sublabel');
            actionsBox.append(wsMenuLabel);

            for (let i = 1; i <= 10; i++) {
                const wsBtn = Gtk.Button.new_with_label('\u2192 WS ' + i);
                wsBtn.add_css_class('popover-item');
                wsBtn.add_css_class('popover-action');
                wsBtn.set_halign(Gtk.Align.FILL);
                const wsNum = i;
                wsBtn.connect('clicked', () => {
                    this.daemon.hyprctl('dispatch movetoworkspace ' + wsNum + ',address:' + instance.address);
                    popover.popdown();
                });
                actionsBox.append(wsBtn);
            }

            // GPU launch submenu
            const gpus = this.daemon.getAvailableGPUs();
            if (gpus.length > 0) {
                const gpuLabel = Gtk.Label.new('Launch with GPU');
                gpuLabel.set_halign(Gtk.Align.START);
                gpuLabel.add_css_class('popover-sublabel');
                actionsBox.append(gpuLabel);

                for (const gpu of gpus) {
                    const gpuBtn = Gtk.Button.new_with_label(gpu);
                    gpuBtn.add_css_class('popover-item');
                    gpuBtn.add_css_class('popover-action');
                    gpuBtn.set_halign(Gtk.Align.FILL);
                    gpuBtn.connect('clicked', () => {
                        this.daemon.launchWithGPU(data.className, gpu);
                        popover.popdown();
                    });
                    actionsBox.append(gpuBtn);
                }
            }

            // Toggle expand/collapse button
            const toggleBtn = Gtk.Button.new_with_label('\u25BC');
            toggleBtn.add_css_class('popover-toggle');
            toggleBtn.set_halign(Gtk.Align.END);
            toggleBtn.connect('clicked', () => {
                actionsBox.visible = !actionsBox.visible;
                toggleBtn.set_label(actionsBox.visible ? '\u25B2' : '\u25BC');
            });

            // Row: [focus button] [expand toggle]
            const instanceRow = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 4);
            instanceRow.append(focusBtn);
            instanceRow.append(toggleBtn);
            menuBox.append(instanceRow);
            menuBox.append(actionsBox);

            // Separator between instances
            if (idx < data.instances.length - 1) {
                const sep = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
                sep.set_margin_top(4);
                sep.set_margin_bottom(4);
                menuBox.append(sep);
            }
        });

        // Global actions
        const globalSep = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
        globalSep.set_margin_top(6);
        globalSep.set_margin_bottom(6);
        menuBox.append(globalSep);

        // New window
        const newWinBtn = Gtk.Button.new_with_label('New Window');
        newWinBtn.add_css_class('popover-item');
        newWinBtn.set_halign(Gtk.Align.FILL);
        newWinBtn.connect('clicked', () => {
            const execCmd = this.daemon.getExecFromDesktop(data.className);
            if (execCmd) {
                GLib.spawn_command_line_async(execCmd);
            } else {
                GLib.spawn_command_line_async(data.className.toLowerCase());
            }
            popover.popdown();
        });
        menuBox.append(newWinBtn);

        // Close all windows
        if (data.instances.length > 1) {
            const closeAllBtn = Gtk.Button.new_with_label('Close All Windows');
            closeAllBtn.add_css_class('popover-item');
            closeAllBtn.set_halign(Gtk.Align.FILL);
            closeAllBtn.connect('clicked', () => {
                for (const instance of data.instances) {
                    this.daemon.closeWindow(instance.address);
                }
                popover.popdown();
            });
            menuBox.append(closeAllBtn);
        }

        // Pin / Unpin
        const pinBtn = Gtk.Button.new_with_label(data.pinned ? 'Unpin' : 'Pin');
        pinBtn.add_css_class('popover-item');
        pinBtn.set_halign(Gtk.Align.FILL);
        pinBtn.connect('clicked', () => {
            this.daemon.togglePin(data.className);
            popover.popdown();
        });
        menuBox.append(pinBtn);

        popover.set_child(menuBox);
        popover.popup();
    }

    // --- Cleanup ------------------------------------------------------
    vfunc_close_request() {
        this.daemon.shutdown();
        cleanupMonitors();
        return false;
    }
});

// --- Application ------------------------------------------------------
const DockApplication = GObject.registerClass({
    GTypeName: 'HyprCandyDockApplication',
}, class DockApplication extends Gtk.Application {
    vfunc_activate() {
        // Initial CSS load (display-level providers)
        performCSSReload();

        // Start file monitors for hot reload
        setupFileMonitors();

        // Register SIGUSR1 handler
        setupSignalHandler();

        // Create dock
        dockWindow = new HyprCandyDock(this);
        this.add_window(dockWindow);
    }
});

// --- Launch -----------------------------------------------------------
const app = new DockApplication({ application_id: 'com.hyprcandy.dock' });
app.run(ARGV);
