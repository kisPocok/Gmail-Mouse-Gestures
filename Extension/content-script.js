
/**
 * Gmail Mouse Gestures (Chrome extension)
 * 
 * Any advice and comments are welcome! 
 * Usage: Press right mouse button then drag any direction
 * Follow me on twitter: @kisPocok
 *
 * @minifier   http://closure-compiler.appspot.com
 * @copyright  2012 David Schneidhoffer <david.schneidhoffer@gmail.com>
 * @license    http://creativecommons.org/licenses/by-nc/3.0/   CC BY-NC
 */
var MouseGesture = (function(d, w) {

    /**
     * "Constans"
     */
    var DIRECTION_UP    = 'up',
        DIRECTION_DOWN  = 'down',
        DIRECTION_LEFT  = 'left',
        DIRECTION_RIGHT = 'right',
        MODE_CSS        = 'css',
        MODE_IMAGE      = 'image',
        MODE_EXTERNAL_IMAGE = MODE_IMAGE;

    /**
     * Params
     */
    var manifest     = null,        // Extension's manifest (config) file
        elementId    = 'mouse-gesture-extension-layout', // arrow container's ID
        element      = null,        // arrow container
        elementTop   = null,        // top arrow
        elementLeft  = null,        // left arrow
        elementRight = null,        // right arrow
        imageUrl     = 'images/gestures.png', // Arrow image location for layout
        imageMode    = MODE_CSS,    // which version? (css, image[==external_image])
        mousePosition = {},         // last mouse click positions
        isMouseDown  = false,       // mouse button is down
        isMouseMoved = false,       // mouse is beeing use
        minimalDeflection = 2,      // minimal distance for starting gestures (in percent%)
        opacityMultiplier = 300,    // opacity controller number (higher=early dark arrows)
        movementY    = 0,           // displacement at Y-axis
        movementX    = 0,           // displacement at X-axis+
        windowSize   = {},          // window visible sizes
        deflectionY  = 0,           // delection since last mousedown event
        deflectionX  = 0;

    /**
     * Constructor, Bootstrap
     */
    var init = function()
    {
        // recount when window resized
        w.onresize = function() {
            setWindowSize();
            setDeflections();
        };

        // at this state DOM is ready

        setWindowSize();
        setDeflections();
        createLayout();
        loadManifest(function() {
            createNotification();
        });

        // TODO kill this shit
        //console.log('Viewport size (x, y): ', windowSize.x, windowSize.y);
        //console.log('Deflection size (x, y): ', deflectionX, deflectionY);
        //d.addEventListener('keydown', function(e) { console.log(e) });

        d.addEventListener('mousedown', mouseDownHandler);
        d.addEventListener('mousemove', mouseMoveHandler);
        d.addEventListener('mouseup', mouseUpHandler);
        d.addEventListener('contextmenu', contextMenuHandler, false);
    };

    var loadManifest = function(callback) {
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open('GET', chrome.extension.getURL('manifest.json'));
        xmlhttp.onload = function (e) {
            manifest = JSON.parse(xmlhttp.responseText);
            callback();
        }
        xmlhttp.send(null);
    }

    /**
     * [createNotification description]
     * @return {[type]} [description]
     */
    var createNotification = function()
    {
        //console.log('MANIFEST', manifest);
        //console.log('VERSION', manifest.version);

        if (window.localStorage === null) {
            return false;
        }

        var lastNotification = localStorage.getItem('MG.lastNotification'), // legutobbi ertesites datuma
            version = localStorage.getItem('MG.version');

        // Update
        if (version !== manifest.version) {
            var notification = webkitNotifications.createHTMLNotification(
                chrome.extension.getURL('notifications/updated.html')
            );
            notification.show();
            setTimeout(function(){ notification.cancel(); }, '15000');
            localStorage.setItem('MG.lastNotification', new Date().getTime());
            localStorage.setItem('MG.version', manifest.version);
        }
    }

    /** 
     * Delete layout
     */
    var removeLayout = function()
    {
        oldLayout = d.getElementById(elementId);
        if (oldLayout) {
            oldLayout.parentNode.removeChild(oldLayout);
            return true;
        }
        return false;
    };

    /**
     * Create layout container (arrows)
     */
    var createLayout = function()
    {
        removeLayout();

        // append css rules
        var cssUrl = chrome.extension.getURL('content-script.css');
        var css = d.createElement('link');
        css.href = cssUrl;
        css.rel = "stylesheet";
        css.onerror = createLayoutCssFallback;
        d.head.appendChild(css);

        /**
         * Shortcut for create sub layers (for arrows)
         */
        var createSubDiv = function(element, className)
        {
            var div = d.createElement('div');
            div.className = className;
            element.appendChild(div);
            return element.getElementsByClassName(className)[0];
        }

        // create new one
        var div = d.createElement('div');
        div.id = elementId;
        elementTop = createSubDiv(div, 'top');
        elementLeft = createSubDiv(div, 'left');
        elementRight = createSubDiv(div, 'right');
        d.body.appendChild(div);
        element = d.getElementById(elementId);

        resetLayout();
    };

    /**
     * Css fallback handler
     */
    createLayoutCssFallback = function()
    {
        console.error("Can't load chrome extension's css! Trying to load built-in image.");

        // fallback
        imageMode = MODE_IMAGE;
        removeLayout();
        var imgUrl = chrome.extension.getURL(imageUrl);
        // temporary img
        var img = d.createElement('img');
        img.src = imgUrl;
        img.onerror = function() {
            imageMode = MODE_EXTERNAL_IMAGE;
            // That was our first bug. image doesn't isset after install, so I replaced.
            imgUrl = 'http://dl.dropbox.com/u/4160407/arrows-default.png';
            console.error("Can't load chrome extension's image. Trying to load external version.");
        };

        // create new one
        var div = d.createElement('div');
        div.id = elementId;
        div.style.position = 'absolute';
        div.style.width = '400px';
        div.style.height = '300px';
        div.style.opacity = 0;
        div.style.zIndex = 10001;
        div.style.backgroundColor = 'transparent';
        div.style.backgroundRepeat = 'no-repeat';
        div.style.backgroundImage = "url(" +imgUrl + ")";
        //div.style.display = 'none';
        d.body.appendChild(div);
        element = d.getElementById(elementId);
    }

    /**
     * Set layout's visibility
     *
     * Important! Element settings depends on imageMode.
     * Available mods:
     * - MODE_CSS: There is a main div and include 3 arrow's div.
     *             Style rules beeing in the external css file.
     * - MODE_IMAGE: There is an empty main div + inline styles
     * - MODE_EXTERNAL_IMAGE: see MODE_IMAGE (similar)
     */
    var changeLayout = function(directionX, directionY)
    {
        var top = 0,
            left = 0,
            right = 0,
            bgPos = 'top left';

        // az elso elemnel sulyozni kell, hogy ne ugraljon 1px eltolodasnal felfele
        if (Math.abs(movementX) < (movementY * 2)
            && directionY == DIRECTION_UP
        ) {
            top = Math.min(0.8, movementY/opacityMultiplier);
            bgPos = 'top center';
           
        } else if (directionX == DIRECTION_LEFT) {
            left = Math.min(0.8, movementX/opacityMultiplier);
            bgPos = 'left -165px';
           
        } else if (directionX == DIRECTION_RIGHT) {
            right = Math.min(0.8, movementX/opacityMultiplier*-1);
            bgPos = 'right -165px';

        } else {
            resetLayout();
        }

        // set opacity every arrow (only when using MODE_CSS)
        if (imageMode == MODE_CSS) {
            elementTop.style.opacity = top;
            elementLeft.style.opacity = left;
            elementRight.style.opacity = right;

        } else if (imageMode == MODE_IMAGE) {
            element.style.backgroundPosition = bgPos;
            element.style.opacity = Math.max(right, left, top, 0);
        }
    };

    /**
     * Reset layout's visibility to default
     */
    var resetLayout = function()
    {
        if (imageMode == MODE_CSS) {
            elementTop.style.opacity = 0;
            elementLeft.style.opacity = 0;
            elementRight.style.opacity = 0;
        } else {
            element.style.opacity = 0;
        }
        element.style.top = '-1000px';
    };

    /**
     * Compute window's visible sizes
     */
    var setWindowSize = function()
    {
        windowSize = {
            'x': w.innerWidth,
            'y': w.innerHeight
        };
    };

    /**
     * Compute diversion
     */
    var setDeflections = function()
    {       
        deflectionY = Math.round(windowSize.y / 100 * minimalDeflection);
        deflectionX = Math.round(windowSize.x / 100 * minimalDeflection);
    };

    /**
     * Handling mouse down events
     */
    var mouseDownHandler = function(e) {
        if (e.button !== 2) {
            resetLayout();
            return false;
        }
        //console.log('mouse DOWN', e);
        isMouseDown = true;
        mousePosition = {
            'x': e.clientX,
            'y': e.clientY
        };
    };

    /**
     * Handling mouse move events
     */
    var mouseMoveHandler = function(e) {
        if (isMouseDown === false) {
            return false;
        }
        //console.log('mouse move');

        element.style.left = (mousePosition.x - (element.offsetWidth/2) ) + 'px';
        element.style.top = (mousePosition.y - (element.offsetHeight/2) ) + 'px';

        movementY = mousePosition.y - e.clientY;
        movementX = mousePosition.x - e.clientX;
        var directionY = getDirection('y', movementY);
        var directionX = getDirection('x', movementX);
        changeLayout(directionX, directionY);
    };

    /**
     * Handling mouse up events
     */
    var mouseUpHandler = function(e) {
        if (e.button !== 2) {
            resetLayout();
            return false;
        }
        console.log('mouse UP!', e);

        // ha az elmozdulas pozitiv, felfele mozdult el, ellenkezo esetben le
        movementY = mousePosition.y - e.clientY;
        movementX = mousePosition.x - e.clientX;
        var directionY = getDirection('y', movementY);
        var directionX = getDirection('x', movementX);

        // minimalis elmozdulas kell, ahhoz hogy mukodjon
        isMouseMoved = directionX !== false || directionY !== false 

        // Trigger events for Gmail!
        if (isMouseMoved) {
            try {
                if (Math.abs(movementX) < (movementY * 2) 
                    && directionY == DIRECTION_UP
                ) {
                    Gmail.loadInbox();

                } else if (directionX == DIRECTION_LEFT) {
                    Gmail.loadNewerMail();

                } else if (directionX == DIRECTION_RIGHT) {
                    Gmail.loadOlderMail();
                }
            } catch(MouseGestureWarn) {
                // error already handled
            }

        }

        resetLayout();
        isMouseDown = false;
    };

    /**
     * Get mouse gesture's direction
     *
     * @param direction string y||x
     * @param movement  int    mouse moving in px from last mousedown event
     */
    var getDirection = function(direction, movement)
    {
        if (direction === 'y') {
            if (Math.abs(movement) > deflectionY) {
                if (movement > deflectionY) {
                    return DIRECTION_UP;
                } else if(movement < deflectionY) {
                    return DIRECTION_DOWN;
                }
            }
        } else if (direction === 'x') {
            if (Math.abs(movement) > deflectionX) {
                if (movement > deflectionX) {
                    return DIRECTION_LEFT;
                } else if (movement < deflectionX) {
                    return DIRECTION_RIGHT;
                }
            }
        }
        return false;
    };

    /**
     * Context Menu letiltasa
     *
     * Jobb gomb letiltasa akkor, ha mar hasznalni szeretne a M.G.-t.
     * Ha a kiindulasi ponthoz kozel engedi el a gombot, normalisan
     * elojon a ContextMenu.
     */
    var contextMenuHandler = function(e)
    {
        if (e.button === 2) {
            if (isMouseMoved === true) {
                e.preventDefault();
                return false;
            } else {
                isMouseMoved = false;
            }
        }
    };

    /**
     * Gmail controller
     */
    var Gmail = (function(d, w) {

        /**
         * this class
         */
        var self = {};

        /**
         * Get pager buttons elements list
         *
         * FIXME valszeg ezt majd surun kell javitani majd
         */
        var getPagers = function()
        {
            var mailPagers = d.getElementsByClassName('adg');
            if (mailPagers.length != 0) {
                // at mail
                return mailPagers;
            } else {
                return []; // FIXME
                /*
                // TODO FIXME at lists (click doesn't happend)
                var listPagers = d.getElementsByClassName('amD');
                return [
                    listPagers[listPagers.length-2],
                    listPagers[listPagers.length-1]
                ];
                */
            }
        };

        /**
         * Go to inbox
         */
        self.loadInbox = function()
        {
            /*
            // FIXME click fired but doesn't work.
            // return to active list
            var backButton = d.getElementsByClassName('lS');
            if (backButton.length > 0 && backButton[0] != null) {
                backButton.className = backButton.className + " T-I-JW";
                //click(backButton[0].getElementsByClassName('asa')[0]);
                click(backButton[0]);
                return;
            }
            */
            
            // return to INBOX
            var inbox = d.getElementsByClassName('GLujEb')[0];
            if (!inbox) {
                throw new MouseGestureWarn('No inbox button, wtf?!');
            }
            click(inbox);
        };

        /**
         * Get older message
         */
        self.loadOlderMail = function()
        {
            var btns = getPagers();
            if (btns.length < 2) {
                throw new MouseGestureWarn('No pager, sorry.');
            }
            click(btns[1]);
        };

        /**
         * Get newer message
         */
        self.loadNewerMail = function()
        {
            var btns = getPagers();
            if (btns.length < 2) {
                throw new MouseGestureWarn('No pager, sorry.');
            }
            click(btns[0]);
        };

        return self;
    }(d, w));


    /**
     * Trigger any keydown push
     *
     * FIXME unfortunatelly it doesn't work.
     * Not passible to set which or charCode values
     * Both of this are read-only in webkit.
     * https://bugs.webkit.org/show_bug.cgi?id=16735
     */
    var triggerKeyDownEvent = function(key)
    {
        var event = d.createEvent("KeyboardEvents");
        event.initKeyboardEvent(
            'keypress', true, true, null,
            key, 100, ''
        );
        //console.log('event fire: ', event)
        d.dispatchEvent(event);

        /*
        // es ezek sem
        var event = d.createEvent("TextEvent");
        event.initTextEvent(
            'textInput', true, true, null,
            String.fromCharCode(key.charCodeAt(0)), 9, "en-US"
        );
        var e = jQuery.Event("keydown");
        e.which = key.charCodeAt(0);
        console.log('EVENT: ', e)
        $(d).trigger(e);

        jQuery.event.trigger({
            type: 'keydown',
            which: key.charCodeAt(0)
        });
        jQuery.event.trigger({
            type: 'keypress',
            which: key.charCodeAt(0)
        });
        jQuery.event.trigger({
            type: 'keyup',
            which: key.charCodeAt(0)
        });
        */
    };

    /**
     * Click on target element!
     */
    var click = function(element)
    {
        return simulateEvent(element, 'click');
    };

    /**
     * Error handling
     */
    var MouseGestureWarn = function(msg)
    {
        console.warn('Mouse Gesture says:', msg);
    };

    /**
     * Error handling
     */
    var MouseGestureError = function(msg)
    {
        console.error('Mouse Gesture error:', msg);
    };

    /**
     * Simulate Event(s)
     *
     * read more about this simulation at
     * http://stackoverflow.com/questions/6157929/how-to-simulate-mouse-click-using-javascript
     */
    var simulateEvent = function(element, eventName)
    {
        var options = extend(defaultOptions, arguments[2] || {});
        var oEvent, eventType = null;

        for (var name in eventMatchers) {
            if (eventMatchers[name].test(eventName)) {
                eventType = name; break;
            }
        }

        if (!eventType) {
            throw new SyntaxError('Only HTMLEvents and MouseEvents interfaces are supported');
        }

        if (d.createEvent) {
            oEvent = d.createEvent(eventType);
            if (eventType == 'HTMLEvents') {
                oEvent.initEvent(eventName, options.bubbles, options.cancelable);
            } else {
                oEvent.initMouseEvent(
                    eventName, options.bubbles, options.cancelable,
                    d.defaultView, options.button, options.pointerX,
                    options.pointerY, options.pointerX, options.pointerY,
                    options.ctrlKey, options.altKey, options.shiftKey,
                    options.metaKey, options.button, element
                );
            }
            element.dispatchEvent(oEvent);
        } else {
            options.clientX = options.pointerX;
            options.clientY = options.pointerY;
            var evt = d.createEventObject();
            oEvent = extend(evt, options);
            element.fireEvent('on' + eventName, oEvent);
        }
        return element;
    };

    var extend = function(destination, source) {
        for (var property in source) {
            destination[property] = source[property];
        }
        return destination;
    };

    var eventMatchers = {
        'HTMLEvents': /^(?:load|unload|abort|error|select|change|submit|reset|focus|blur|resize|scroll)$/,
        'MouseEvents': /^(?:click|dblclick|mouse(?:down|up|over|move|out))$/
    };

    var defaultOptions = {
        pointerX: 0,
        pointerY: 0,
        button: 0,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true
    };

    /**
     * - Maximum warp speed.
     * - Ay ay Captain!
     */
    if (window == window.top) {
        w.addEventListener('load', init, false);
    }

}(window.top.document.getElementById('canvas_frame').contentDocument, window.top));
