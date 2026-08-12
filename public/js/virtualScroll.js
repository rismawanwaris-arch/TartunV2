const VirtualScrollManager = {
    create(config) {
        const instance = {
            ...config,
            scrollTop: 0,
            renderedStart: 0,
            renderedEnd: 0,
            resizeObserver: null,
        };

        for (const key in this) {
            if (typeof this[key] === 'function' && key !== 'create') {
                instance[key] = this[key].bind(instance);
            }
        }
        
        instance.throttledScrollHandler = instance._throttle(instance.handleScroll, 16);
        instance.containerEl.addEventListener('scroll', instance.throttledScrollHandler);
        
        instance.resizeObserver = new ResizeObserver(() => {
            instance.updateAndRender();
        });
        instance.resizeObserver.observe(instance.containerEl);

        return instance;
    },

    initialize() {
        let attempts = 0;
        const maxAttempts = 100;

        const checkAndRender = () => {
            attempts++;
            if (this.containerEl.clientHeight > 0) {
                this.updateAndRender();
            } else if (attempts < maxAttempts) {
                requestAnimationFrame(checkAndRender);
            } else {
                console.error("VirtualScrollManager: Container element did not become visible after several attempts.");
            }
        };

        requestAnimationFrame(checkAndRender);
    },

    destroy() {
        this.containerEl.removeEventListener('scroll', this.throttledScrollHandler);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    },

    handleScroll(event) {
        this.scrollTop = event.target.scrollTop;
        this.updateAndRender();
    },

    updateData(newData) {
        this.fullData = newData;
        this.containerEl.scrollTop = 0;
        this.scrollTop = 0;
        this.updateAndRender();
    },

    updateAndRender() {
        if (this.containerEl.clientHeight === 0) {
            return; 
        }

        const totalRowCount = this.fullData.length;
        const totalHeight = totalRowCount * this.rowHeight;

        const startIndex = Math.floor(this.scrollTop / this.rowHeight);
        const buffer = 5;
        
        this.renderedStart = Math.max(0, startIndex - buffer);
        
        const visibleRowCount = Math.ceil(this.containerEl.clientHeight / this.rowHeight);
        this.renderedEnd = Math.min(totalRowCount, startIndex + visibleRowCount + buffer);
        
        this._render(totalHeight);
    },

    _render(totalHeight) {
        if (!this.scrollerEl || !this.contentEl) return;

        this.scrollerEl.style.height = `${totalHeight}px`;

        const visibleData = this.fullData.slice(this.renderedStart, this.renderedEnd);
        
        this.contentEl.innerHTML = visibleData.map(this.renderRowFunction).join('');

        const offsetY = this.renderedStart * this.rowHeight;
        this.contentEl.style.transform = `translateY(${offsetY}px)`;

        if (this.onRenderCallback) {
            this.onRenderCallback();
        }
    },

    _throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};