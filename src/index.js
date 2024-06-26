'use strict';

var clamp = require('clamp');
var isNumber = require('lodash/lang/isNumber');
var isObject = require('lodash/lang/isObject');
var debounce = require('lodash/function/debounce');
var objectAssign = require('object-assign');
var eve = require('dom-events');
var attach = require('attach-dom-events');

var MAX_SET_BY_DEFAULT = 100;
var HANDLE_RESIZE_DEBOUNCE = 100;
var RANGE_CLASS = 'rangeslider';
var FILL_CLASS = 'rangeslider__fill';
var HANDLE_CLASS = 'rangeslider__handle';
var DISABLED_CLASS = 'rangeslider--disabled';
var STEP_SET_BY_DEFAULT = 1;

var pluginName = 'rangeslider-js',
    pluginIdentifier = 0,
    defaults = {
        min: null,
        max: null,
        step: null,
        value: null
    };

/**
 * Check if a `element` is visible in the DOM
 *
 * @param  {Element}  element
 * @return {Boolean}
 */
function isHidden(element) {
    return !!(element.offsetWidth === 0 || element.offsetHeight === 0 || element.open === false);
}

/**
 * Get hidden parentNodes of an `element`
 *
 * @param  {Element} element
 * @return {Element[]}
 */
function getHiddenParentNodes(element) {

    var parents = [],
        node = element.parentNode;

    while (isHidden(node)) {
        parents.push(node);
        node = node.parentNode;
    }
    return parents;
}

/**
 * Returns dimensions for an element even if it is not visible in the DOM.
 *
 * @param  {Element} element
 * @param  {string}  key     (e.g. offsetWidth …)
 * @return {Number}
 */
function getDimension(element, key) {

    var hiddenParentNodes = getHiddenParentNodes(element),
        hiddenParentNodesLength = hiddenParentNodes.length,
        displayProperty = [],
        dimension = element[key],
        hiddenStyles, i;

    // Used for native `<details>` elements
    function toggleOpenProperty(element) {
        if (typeof element.open !== 'undefined') {
            element.open = !element.open;
        }
    }

    if (hiddenParentNodesLength) {

        for (i = 0; i < hiddenParentNodesLength; i++) {
            hiddenStyles = hiddenParentNodes[i].style;
            // Cache the display property to restore it later.
            displayProperty[i] = hiddenStyles.display;
            hiddenStyles.display = 'block';
            hiddenStyles.height = '0';
            hiddenStyles.overflow = 'hidden';
            hiddenStyles.visibility = 'hidden';

            toggleOpenProperty(hiddenParentNodes[i]);
        }

        dimension = element[key];

        for (i = 0; i < hiddenParentNodesLength; i++) {
            hiddenStyles = hiddenParentNodes[i].style;
            toggleOpenProperty(hiddenParentNodes[i]);
            hiddenStyles.display = displayProperty[i];
            hiddenStyles.height = '';
            hiddenStyles.overflow = '';
            hiddenStyles.visibility = '';
        }
    }
    console.log(dimension);
    return dimension;
}

function isString(obj) {
    return obj === '' + obj;
}

/**
 *
 * @param {HTMLElement} el
 * @callback callback
 * @param {boolean} andForElement - apply callback for el
 * @returns {HTMLElement}
 */
function forEachAncestors(el, callback, andForElement) {
    if (andForElement) {
        callback(el);
    }
    while (el.parentNode && !callback(el)) {
        el = el.parentNode;
    }
    return el;
}

/**
 * @param {Object} referenceNode after this
 * @param {Object} newNode insert this
 */
function insertAfter(referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

/**
 * RangeSlider
 * @param {HTMLElement} element
 * @param {this} options
 */
function RangeSlider(el, options) {

    this.element = el;
    this.options = objectAssign(defaults, options);

    this.onSlideEventsCount = -1;
    this.isInteractsNow = false;
    this.needTriggerEvents = false;

    this.identifier = 'js-' + pluginName + '-' + (pluginIdentifier++);
    this.min = this.options.min || parseFloat(el.getAttribute('min')) || 0;
    this.max = this.options.max || parseFloat(el.getAttribute('max')) || MAX_SET_BY_DEFAULT;
    this.value = this.options.value || parseFloat(el.value) || this.min + (this.max - this.min) / 2;
    this.step = this.options.step || el.getAttribute('step') || STEP_SET_BY_DEFAULT;
    this.percent = null;
    this._updatePercentFromValue();
    this.toFixed = this._toFixed(this.step);

    this.fill = document.createElement('div');
    this.fill.className = FILL_CLASS;

    this.handle = document.createElement('div');
    this.handle.className = HANDLE_CLASS;

    this.range = document.createElement('div');
    this.range.className = RANGE_CLASS;
    this.range.id = this.identifier;
    this.range.appendChild(this.handle);
    this.range.appendChild(this.fill);

    this._setValue(this.value, true);
    el.value = this.options.value;

    el.setAttribute('min', '' + this.min);
    el.setAttribute('max', '' + this.max);
    el.setAttribute('step', '' + this.step);

    insertAfter(el, this.range);

    el.style.position = 'absolute';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    el.style.opacity = '0';

    // Store context
    //this._handleResize = this._handleResize.bind(this);
    this._handleDown = this._handleDown.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._handleEnd = this._handleEnd.bind(this);
    this._startEventListener = this._startEventListener.bind(this);
    this._changeEventListener = this._changeEventListener.bind(this);

    this._init();

    //// Attach Events
    window.addEventListener('resize', debounce(this._handleResize.bind(this), HANDLE_RESIZE_DEBOUNCE), false);

    attach(document, {
        mousedown: this._startEventListener,
        touchstart: this._startEventListener,
        pointerdown: this._startEventListener
    });

    // Listen to programmatic value changes
    attach.on(el, {
        change: this._changeEventListener
    })
}

RangeSlider.prototype.constructor = RangeSlider;

/**
 *
 * @param step
 * @returns {number}
 * @private
 */
RangeSlider.prototype._toFixed = function (step) {
    return (step + '').replace('.', '').length - 1;
};

/**
 *
 * @private
 */
RangeSlider.prototype._init = function () {
    if (this.options.onInit) {
        this.options.onInit();
    }
    this._update();
};

/**
 *
 * @private
 */
RangeSlider.prototype._updatePercentFromValue = function () {
    this.percent = (this.value - this.min) / (this.max - this.min);
};

/**
 * This method check if this.identifier exists in ev.target's ancestors
 * @param ev
 * @param data
 */
RangeSlider.prototype._startEventListener = function (ev, data) {
    var _this = this;
    var el = ev.target;
    var isEventOnSlider = false;

    forEachAncestors(el, function (el) {
        return (isEventOnSlider = el.id === _this.identifier && !el.classList.contains(DISABLED_CLASS));
    }, true);

    if (isEventOnSlider) {
        this._handleDown(ev, data);
    }
};

/**
 *
 * @param ev
 * @param data
 * @private
 */
RangeSlider.prototype._changeEventListener = function (ev, data) {
    if (data && data.origin === this.identifier) {
        return;
    }
    var value = ev.target.value;
    this._setPosition(this._getPositionFromValue(value));
};

/**
 *
 * @private
 */
RangeSlider.prototype._update = function () {

    this.handleWidth = getDimension(this.handle, 'offsetWidth');
    this.rangeWidth = getDimension(this.range, 'offsetWidth');
    this.maxHandleX = this.rangeWidth - this.handleWidth;
    this.grabX = this.handleWidth / 2;
    this.position = this._getPositionFromValue(this.value);

    this.range.classList[this.element.disabled ? 'add' : 'remove'](DISABLED_CLASS);

    this._setPosition(this.position);
    this._updatePercentFromValue();
    this.element.dispatchEvent(new Event('change'));
};

/**
 *
 */
RangeSlider.prototype._handleResize = function () {
    this._update();
};

RangeSlider.prototype._handleDown = function (e) {

    this.isInteractsNow = true;
    e.preventDefault();
    attach.on(document, {
        mousemove: this._handleMove,
        touchmove: this._handleMove,
        pointermove: this._handleMove,

        mouseup: this._handleEnd,
        touchend: this._handleEnd,
        pointerup: this._handleEnd
    });

    // If we click on the handle don't set the new position
    if (e.target.classList.contains(HANDLE_CLASS)) {
        return;
    }

    var posX = this._getRelativePosition(e),
        rangeX = this.range.getBoundingClientRect().left,
        handleX = this._getPositionFromNode(this.handle) - rangeX;

    this._setPosition(posX - this.grabX);

    if (posX >= handleX && posX < handleX + this.handleWidth) {
        this.grabX = posX - handleX;
    }
    this._updatePercentFromValue();

};

RangeSlider.prototype._handleMove = function (e) {
    this.isInteractsNow = true;
    e.preventDefault();
    var posX = this._getRelativePosition(e);
    this._setPosition(posX - this.grabX);
};

RangeSlider.prototype._handleEnd = function (e) {
    e.preventDefault();

    attach.off(document, {
        mousemove: this._handleMove,
        touchmove: this._handleMove,
        pointermove: this._handleMove,

        mouseup: this._handleEnd,
        touchend: this._handleEnd,
        pointerup: this._handleEnd
    });

    eve.emit(this.element, 'change', {origin: this.identifier} );

    if ((this.isInteractsNow || this.needTriggerEvents) && this.options.onSlideEnd) {
        this.options.onSlideEnd(this.value, this.percent, this.position);
    }
    this.onSlideEventsCount = 0;
    this.isInteractsNow = false;
};

RangeSlider.prototype._setPosition = function (pos) {
    var value= this._getValueFromPosition(clamp(pos, 0, this.maxHandleX)),
        left = this._getPositionFromValue(value);

    // Update ui
    this.fill.style.width = (left + this.grabX) + 'px';
    this.handle.style.left = left + 'px';
    this._setValue(value);

    // Update globals
    this.position = left;
    this.value = value;
    this._updatePercentFromValue();

    if (this.isInteractsNow || this.needTriggerEventss) {
        if (this.options.onSlideStart && this.onSlideEventsCount === 0) {
            this.options.onSlideStart(this.value, this.percent, this.position);
        }

        if (this.options.onSlide) {
            this.options.onSlide(this.value, this.percent, this.position);
        }
    }

    this.onSlideEventsCount++;
};

// Returns element position relative to the parent
RangeSlider.prototype._getPositionFromNode = function (node) {
    var i = 0;
    while (node !== null) {
        i += node.offsetLeft;
        node = node.offsetParent;
    }
    return i;
};

/**
 *
 * @param {(MouseEvent|TouchEvent)}e
 * @returns {number}
 */
RangeSlider.prototype._getRelativePosition = function (e) {
    // Get the offset left relative to the viewport
    var rangeX = this.range.getBoundingClientRect().left,
        orgEv = e.originalEvent,
        pageX = 0;

    if (typeof e.pageX !== 'undefined') {
        pageX = (e.touches && e.touches.length) ? e.touches[0].pageX : e.pageX;
    } else if (typeof orgEv.clientX !== 'undefined') {
        pageX = orgEv.clientX;
    } else if (orgEv.touches && orgEv.touches[0] && typeof orgEv.touches[0].clientX !== 'undefined') {
        pageX = orgEv.touches[0].clientX;
    } else if (e.currentPoint && typeof e.currentPoint.x !== 'undefined') {
        pageX = e.currentPoint.x;
    }

    return pageX - rangeX;
};

/**
 *
 * @param value
 * @returns {number|*}
 * @private
 */
RangeSlider.prototype._getPositionFromValue = function (value) {
    var percentage, pos;
    percentage = (value - this.min) / (this.max - this.min);
    pos = percentage * this.maxHandleX;
    return pos;
};

/**
 *
 * @param pos
 * @returns {number}
 * @private
 */
RangeSlider.prototype._getValueFromPosition = function (pos) {
    var percentage, value;
    percentage = ((pos) / (this.maxHandleX || 1));
    value = this.step * Math.round(percentage * (this.max - this.min) / this.step) + this.min;
    return Number((value).toFixed(this.toFixed));
};

/**
 *
 * @param value
 * @param force
 * @private
 */
RangeSlider.prototype._setValue = function (value, force) {

    if (value === this.value && !force) {
        return;
    }

    // Set the new value and fire the `input` event
    this.element.value = value;
    this.value = value;
    eve.emit(this.element, 'input', {origin: this.identifier});

};


/**
 *
 * @param {Object} obj like {min : Number, max : Number, value : Number, step : Number}
 * @param {Boolean} triggerEvents
 * @returns {RangeSlider}
 */
RangeSlider.prototype.update = function (obj, triggerEvents) {
    if (triggerEvents) {
        this.needTriggerEvents = true;
    }
    if (isObject(obj)) {
        if (isNumber(obj.min)) {
            this.element.setAttribute('min', '' + obj.min);
            this.min = obj.min;
        }

        if (isNumber(obj.max)) {
            this.element.setAttribute('max', '' + obj.max);
            this.max = obj.max;
        }

        if (isNumber(obj.step)) {
            this.element.setAttribute('step', '' + obj.step);
            this.step = obj.step;
            this.toFixed = this._toFixed(obj.step);
        }

        if (isNumber(obj.value)) {
            this._setValue(obj.value);
        }
    }

    this._update();
    this.onSlideEventsCount = 0;
    this.needTriggerEvents = false;
    return this;
};

/**
 *
 */
RangeSlider.prototype.destroy = function () {

    window.removeEventListener('resize', this._handleResize, false);

    attach.off(document, {
        mousedown: this._startEventListener,
        touchstart: this._startEventListener,
        pointerdown: this._startEventListener,
    });
    attach.off(this.element, {
        change: this._changeEventListener
    });

    this.element.style.cssText = '';
    delete this.element[pluginName];

    // Remove the generated markup
    if (this.range) {
        this.range.parentNode.removeChild(this.range);
    }
};

/**
 * A lightweight plugin wrapper around the constructor, preventing multiple instantiations
 * @param el
 * @param options
 */
RangeSlider.create = function (el, options) {
    function createInstance(el) {
        el[pluginName] =el[pluginName] || new RangeSlider(el, options);
    }
    if (el.length) {
        Array.prototype.slice.call(el).forEach(function (el) {
            createInstance(el);
        });
    } else {
        createInstance(el);
    }
};

module.exports = RangeSlider;
