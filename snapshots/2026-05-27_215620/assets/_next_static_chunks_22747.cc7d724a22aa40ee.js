"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[22747],{22747:(e,t,i)=>{i.r(t),i.d(t,{W3mModal:()=>c});var o=i(2113),s=i(40734),a=i(48797),n=i(27433);let r=(0,a.AH)`
  :host {
    z-index: var(--w3m-z-index);
    display: block;
    backface-visibility: hidden;
    will-change: opacity;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    opacity: 0;
    background-color: var(--wui-cover);
    transition: opacity 0.2s var(--wui-ease-out-power-2);
    will-change: opacity;
  }

  :host(.open) {
    opacity: 1;
  }

  wui-card {
    max-width: var(--w3m-modal-width);
    width: 100%;
    position: relative;
    animation: zoom-in 0.2s var(--wui-ease-out-power-2);
    animation-fill-mode: backwards;
    outline: none;
  }

  wui-card[shake='true'] {
    animation:
      zoom-in 0.2s var(--wui-ease-out-power-2),
      w3m-shake 0.5s var(--wui-ease-out-power-2);
  }

  wui-flex {
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 700px) and (min-width: 431px) {
    wui-flex {
      align-items: flex-start;
    }

    wui-card {
      margin: var(--wui-spacing-xxl) 0px;
    }
  }

  @media (max-width: 430px) {
    wui-flex {
      align-items: flex-end;
    }

    wui-card {
      max-width: 100%;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom: none;
      animation: slide-in 0.2s var(--wui-ease-out-power-2);
    }

    wui-card[shake='true'] {
      animation:
        slide-in 0.2s var(--wui-ease-out-power-2),
        w3m-shake 0.5s var(--wui-ease-out-power-2);
    }
  }

  @keyframes zoom-in {
    0% {
      transform: scale(0.95) translateY(0);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes slide-in {
    0% {
      transform: scale(1) translateY(50px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes w3m-shake {
    0% {
      transform: scale(1) rotate(0deg);
    }
    20% {
      transform: scale(1) rotate(-1deg);
    }
    40% {
      transform: scale(1) rotate(1.5deg);
    }
    60% {
      transform: scale(1) rotate(-1.5deg);
    }
    80% {
      transform: scale(1) rotate(1deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes w3m-view-height {
    from {
      height: var(--prev-height);
    }
    to {
      height: var(--new-height);
    }
  }
`;var l=function(e,t,i,o){var s,a=arguments.length,n=a<3?t:null===o?o=Object.getOwnPropertyDescriptor(t,i):o;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)n=Reflect.decorate(e,t,i,o);else for(var r=e.length-1;r>=0;r--)(s=e[r])&&(n=(a<3?s(n):a>3?s(t,i,n):s(t,i))||n);return a>3&&n&&Object.defineProperty(t,i,n),n};let d="scroll-lock",c=class extends a.WF{constructor(){super(),this.unsubscribe=[],this.abortController=void 0,this.open=o.W3.state.open,this.caipAddress=o.Uj.state.caipAddress,this.isSiweEnabled=o.Hd.state.isSiweEnabled,this.connected=o.Uj.state.isConnected,this.loading=o.W3.state.loading,this.shake=o.W3.state.shake,this.initializeTheming(),o.Np.prefetch(),this.unsubscribe.push(o.W3.subscribeKey("open",e=>e?this.onOpen():this.onClose()),o.W3.subscribeKey("shake",e=>this.shake=e),o.W3.subscribeKey("loading",e=>{this.loading=e,this.onNewAddress(o.Uj.state.caipAddress)}),o.Uj.subscribeKey("isConnected",e=>this.connected=e),o.Uj.subscribeKey("caipAddress",e=>this.onNewAddress(e)),o.Hd.subscribeKey("isSiweEnabled",e=>this.isSiweEnabled=e)),o.En.sendEvent({type:"track",event:"MODAL_LOADED"})}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),this.onRemoveKeyboardListener()}render(){return this.open?(0,a.qy)`
          <wui-flex @click=${this.onOverlayClick.bind(this)} data-testid="w3m-modal-overlay">
            <wui-card
              shake="${this.shake}"
              role="alertdialog"
              aria-modal="true"
              tabindex="0"
              data-testid="w3m-modal-card"
            >
              <w3m-header></w3m-header>
              <w3m-router></w3m-router>
              <w3m-snackbar></w3m-snackbar>
            </wui-card>
          </wui-flex>
          <w3m-tooltip></w3m-tooltip>
        `:null}async onOverlayClick(e){e.target===e.currentTarget&&await this.handleClose()}async handleClose(){let e="ConnectingSiwe"===o.IN.state.view,t="ApproveTransaction"===o.IN.state.view;if(this.isSiweEnabled){let{SIWEController:s}=await i.e(21121).then(i.bind(i,21121));"success"!==s.state.status&&(e||t)?o.W3.shake():o.W3.close()}else o.W3.close()}initializeTheming(){let{themeVariables:e,themeMode:t}=o.Wn.state,i=s.UiHelperUtil.getColorTheme(t);(0,s.initializeTheming)(e,i)}onClose(){this.open=!1,this.classList.remove("open"),this.onScrollUnlock(),o.Pt.hide(),this.onRemoveKeyboardListener()}onOpen(){this.open=!0,this.classList.add("open"),this.onScrollLock(),this.onAddKeyboardListener()}onScrollLock(){let e=document.createElement("style");e.dataset.w3m=d,e.textContent=`
      body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: contain;
      }
      w3m-modal {
        pointer-events: auto;
      }
    `,document.head.appendChild(e)}onScrollUnlock(){let e=document.head.querySelector(`style[data-w3m="${d}"]`);e&&e.remove()}onAddKeyboardListener(){this.abortController=new AbortController;let e=this.shadowRoot?.querySelector("wui-card");e?.focus(),window.addEventListener("keydown",t=>{if("Escape"===t.key)this.handleClose();else if("Tab"===t.key){let{tagName:i}=t.target;!i||i.includes("W3M-")||i.includes("WUI-")||e?.focus()}},this.abortController)}onRemoveKeyboardListener(){this.abortController?.abort(),this.abortController=void 0}async onNewAddress(e){if(!this.connected||this.loading)return;let t=o.wE.getPlainAddress(this.caipAddress),s=o.wE.getPlainAddress(e),a=o.wE.getNetworkId(this.caipAddress),n=o.wE.getNetworkId(e);if(this.caipAddress=e,this.isSiweEnabled){let{SIWEController:e}=await i.e(21121).then(i.bind(i,21121)),o=await e.getSession();if(o&&t&&s&&t!==s){e.state._client?.options.signOutOnAccountChange&&(await e.signOut(),this.onSiweNavigation());return}if(o&&a&&n&&a!==n){e.state._client?.options.signOutOnNetworkChange&&(await e.signOut(),this.onSiweNavigation());return}this.onSiweNavigation()}}onSiweNavigation(){this.open?o.IN.push("ConnectingSiwe"):o.W3.open({view:"ConnectingSiwe"})}};c.styles=r,l([(0,n.wk)()],c.prototype,"open",void 0),l([(0,n.wk)()],c.prototype,"caipAddress",void 0),l([(0,n.wk)()],c.prototype,"isSiweEnabled",void 0),l([(0,n.wk)()],c.prototype,"connected",void 0),l([(0,n.wk)()],c.prototype,"loading",void 0),l([(0,n.wk)()],c.prototype,"shake",void 0),c=l([(0,s.customElement)("w3m-modal")],c)}}]);