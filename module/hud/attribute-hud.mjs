const DEFAULT_ATTRIBUTE_ORDER = [
  "corpsacorps",
  "capacitedetir",
  "force",
  "agilite",
  "intelligence",
  "perception",
  "stress"
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export class D100AttributeHud {
  constructor() {
    /** @type {Token|null} */
    this.token = null;

    /** @type {HTMLElement|null} */
    this.element = null;

    /** @type {{left: number, top: number}|null} */
    this.position = null;

    /** @type {boolean} */
    this._hasManualPosition = false;

    /** @type {boolean} */
    this._isDragging = false;

    /** @type {{x: number, y: number}} */
    this._dragOffset = { x: 0, y: 0 };

    /** @type {boolean} */
    this._shouldAutoPlace = false;

    this._boundWindowResize = this.refreshPosition.bind(this);
    this._boundDragMove = this._onDragMove.bind(this);
    this._boundDragEnd = this._onDragEnd.bind(this);
  }

  /* -------------------------------------------- */
  /* LIFECYCLE                                    */
  /* -------------------------------------------- */

  init() {
    if (this.element) return;

    const el = document.createElement("div");
    el.id = "d100base-attribute-hud";
    el.className = "d100base-attribute-hud";
    el.hidden = true;

    document.body.appendChild(el);
    this.element = el;

    window.addEventListener("resize", this._boundWindowResize);
  }

  destroy() {
    window.removeEventListener("resize", this._boundWindowResize);
    window.removeEventListener("mousemove", this._boundDragMove);
    window.removeEventListener("mouseup", this._boundDragEnd);

   if (this.element) {
      this.element.remove();
      this.element = null;
    }

    this.token = null;
    this.position = null;
    this._hasManualPosition = false;
    this._isDragging = false;
  }

  /* -------------------------------------------- */
  /* STATE                                        */
  /* -------------------------------------------- */

  get actor() {
    return this.token?.actor ?? null;
  }

  isSupportedToken(token) {
    return !!(
      token &&
      token.actor &&
      token.actor.type === "character"
    );
  }

  async bind(token) {
    if (!this.isSupportedToken(token)) {
      this.clear();
      return;
    }

    const tokenChanged = token?.id !== this.token?.id;

    this.token = token;

    if (tokenChanged && !this._hasManualPosition) {
      this._shouldAutoPlace = true;
    }

    await this.render();
  }

  clear() {
    this.token = null;
    this._isDragging = false;

    window.removeEventListener("mousemove", this._boundDragMove);
    window.removeEventListener("mouseup", this._boundDragEnd);

    if (!this.element) return;

    this.element.innerHTML = "";
    this.element.hidden = true;
    this.element.classList.remove("active", "dragging");
  }

  async refresh() {
    if (!this.isSupportedToken(this.token)) {
      this.clear();
      return;
    }

    await this.render();
  }

  async refreshIfActor(actor) {
    if (!actor || !this.actor) return;
    if (actor.id !== this.actor.id) return;

    await this.refresh();
  }

  /* -------------------------------------------- */
  /* DATA                                         */
  /* -------------------------------------------- */

  async getData() {
    if (!this.actor) {
      return {
        actorName: "",
        actorImg: "",
        hudTitle: "",
        openStateTitle: "",
        initiativeTitle: "",
        initiativeLabel: "",
        attributes: []
      };
    }

    const systemAttributes = this.actor.system?.attributes ?? {};
    const presentKeys = Object.keys(systemAttributes);

    const orderedKeys = [
      ...DEFAULT_ATTRIBUTE_ORDER.filter(key => presentKeys.includes(key)),
      ...presentKeys.filter(key => !DEFAULT_ATTRIBUTE_ORDER.includes(key))
    ];

    const attributes = orderedKeys.map((key) => {
      const value = Number(systemAttributes[key] ?? 0);
      const label = game.i18n.localize(`D100BASE.Attributes.${key}`);

      const shortKey = `D100BASE.AttributesShort.${key}`;
      const shortLocalized = game.i18n.localize(shortKey);
      const short = shortLocalized !== shortKey ? shortLocalized : key;

      return {
        key,
        short,
        label,
        value: Number.isFinite(value) ? value : 0,
        rollTitle: game.i18n.format("D100BASE.HUD.RollAttribute", {
          attribute: label
        })
      };
    });

    return {
	  hudTitle:
	    this.token?.name ||
	    this.actor?.name ||
	    game.i18n.localize("D100BASE.HUD.AttributesTitle"),
      openStateTitle: game.i18n.localize("D100BASE.Actor.State"),
      initiativeTitle: game.i18n.localize("D100BASE.Initiative.RollTitle"),
      initiativeLabel: game.i18n.localize("D100BASE.Initiative.ShortLabel"),
      attributes
    };
  }

  /* -------------------------------------------- */
  /* RENDER                                       */
  /* -------------------------------------------- */

  async render() {
    if (!this.element) this.init();

    if (!this.actor || !this.element) {
      this.clear();
      return;
    }  

    const data = await this.getData();
    const html = await renderTemplate(
      "systems/d100base/templates/attribute-hud.hbs",
      data
    );

    this.element.innerHTML = html;
    this.element.hidden = false;
    this.element.classList.add("active");

    this.activateListeners();

    if (this._shouldAutoPlace || !this.position) {
      this._setDefaultPositionNearToken();
      this._shouldAutoPlace = false;
    } else {
      this.refreshPosition();
    }
  }

  refreshPosition() {
    if (!this.element || this.element.hidden) return;

    const rect = this.element.getBoundingClientRect();
    const width = rect.width || 320;
    const height = rect.height || 90;
    const margin = 12;

    const currentLeft = this.position?.left ?? margin;
    const currentTop = this.position?.top ?? margin;

    const left = clamp(currentLeft, margin, window.innerWidth - width - margin);
    const top = clamp(currentTop, margin, window.innerHeight - height - margin);

    this.position = { left, top };
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }
  
  _setDefaultPositionNearToken() {
    if (!this.element || !this.token || !canvas?.ready) return;

    const appView = canvas.app?.view ?? canvas.app?.renderer?.view;
    const stage = canvas.stage;

    if (!appView || !stage) return;

    const rect = appView.getBoundingClientRect();

    const scaleX = stage.scale.x || 1;
    const scaleY = stage.scale.y || 1;

    const tokenCenterX = this.token.center.x;
    const tokenTopY = this.token.y;
    const tokenBottomY = this.token.y + this.token.h;

    const screenX = rect.left + ((tokenCenterX - stage.pivot.x) * scaleX);
    const screenTopY = rect.top + ((tokenTopY - stage.pivot.y) * scaleY);
    const screenBottomY = rect.top + ((tokenBottomY - stage.pivot.y) * scaleY);

    const hudRect = this.element.getBoundingClientRect();
    const width = hudRect.width || 320;
    const height = hudRect.height || 90;
    const margin = 12;

    let left = screenX - (width / 2);
    let top = screenTopY - height - margin;

    if (top < margin) {
      top = screenBottomY + margin;
    }

    left = clamp(left, margin, window.innerWidth - width - margin);
    top = clamp(top, margin, window.innerHeight - height - margin);

    this.position = { left, top };
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }
  
  /* -------------------------------------------- */
  /* ROLL OPTIONS                                 */
  /* -------------------------------------------- */

  async _openRollOptionsDialog() {
    const content = `
      <form class="d100base-roll-options-dialog">
        <div class="form-group">
          <label>Bonus / Malus</label>
          <input type="number" name="modifier" value="0" step="1">
          <p class="notes">
            Bonus = abaisse la cible, malus = augmente la cible.
          </p>
        </div>

        <div class="form-group">
          <label>Mode</label>
          <select name="mode">
            <option value="normal">Normal</option>
            <option value="advantage">Avantage</option>
            <option value="disadvantage">Désavantage</option>
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: "Options de jet",
        content,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D100BASE.Common.Save"),
            callback: html => {
              const modifier = Number(html.find('[name="modifier"]').val() ?? 0) || 0;
              const mode = String(html.find('[name="mode"]').val() ?? "normal");

              resolve({
                modifier,
                mode
              });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "confirm",
        render: html => {
          html.find('[name="modifier"]').trigger("focus");
          html.find('[name="modifier"]').trigger("select");
        },
        close: () => resolve(null)
      }).render(true);
    });
  }

  async _resolveRollOptionsFromEvent(event) {
    if (!event?.ctrlKey) {
      return {
        modifier: 0,
        mode: "normal"
      };
    }

    return this._openRollOptionsDialog();
  }

  /* -------------------------------------------- */
  /* EVENTS                                       */
  /* -------------------------------------------- */

  activateListeners() {
    if (!this.element) return;

    const rollButtons = this.element.querySelectorAll('[data-action="roll-attribute"]');
    for (const button of rollButtons) {
      button.addEventListener("click", this._onRollAttribute.bind(this));
    }

    const initiativeButton = this.element.querySelector('[data-action="roll-initiative"]');
    if (initiativeButton) {
      initiativeButton.addEventListener("click", this._onRollInitiative.bind(this));
    }

    const stateButton = this.element.querySelector('[data-action="open-state-tab"]');
    if (stateButton) {
      stateButton.addEventListener("click", this._onOpenStateTab.bind(this));
    }

    const dragHandle = this.element.querySelector('[data-action="drag-handle"]');
    if (dragHandle) {
      dragHandle.addEventListener("mousedown", this._onDragStart.bind(this));
    }
  }

  _onDragStart(event) {
    if (!this.element) return;

    event.preventDefault();

    const rect = this.element.getBoundingClientRect();

    this._isDragging = true;
    this._dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    this.element.classList.add("dragging");

    window.addEventListener("mousemove", this._boundDragMove);
    window.addEventListener("mouseup", this._boundDragEnd);
  }

  _onDragMove(event) {
    if (!this._isDragging || !this.element) return;

    const rect = this.element.getBoundingClientRect();
    const width = rect.width || 320;
    const height = rect.height || 90;
    const margin = 12;

    let left = event.clientX - this._dragOffset.x;
    let top = event.clientY - this._dragOffset.y;

    left = clamp(left, margin, window.innerWidth - width - margin);
    top = clamp(top, margin, window.innerHeight - height - margin);

    this.position = { left, top };
    this._hasManualPosition = true;

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  _onDragEnd() {
    this._isDragging = false;

    if (this.element) {
      this.element.classList.remove("dragging");
    }

    window.removeEventListener("mousemove", this._boundDragMove);
    window.removeEventListener("mouseup", this._boundDragEnd);
  }
 
  async _onRollAttribute(event) {
    event.preventDefault();

    if (!this.actor) return;

    const button = event.currentTarget;
    const attributeKey = button.dataset.attributeKey;
    if (!attributeKey) return;

    if (typeof this.actor.rollAttribute !== "function") {
      ui.notifications?.warn(
        game.i18n.localize("D100BASE.HUD.MissingRollMethod")
      );
      return;
    }

    const options = await this._resolveRollOptionsFromEvent(event);
    if (!options) return;

    button.disabled = true;

    try {
      await this.actor.rollAttribute(attributeKey, {
        modifier: options.modifier,
        mode: options.mode
      });
    } catch (err) {
      console.error("D100 Base | Attribute HUD roll error", err);
      ui.notifications?.error(
        game.i18n.localize("D100BASE.HUD.RollError")
      );
    } finally {
      button.disabled = false;
    }
  }

  async _onRollInitiative(event) {
    event.preventDefault();

    if (!this.actor) return;

    const button = event.currentTarget;
    if (!button) return;

    if (typeof this.actor.rollInitiative !== "function") {
      ui.notifications?.warn(
        game.i18n.localize("D100BASE.Initiative.MissingRollMethod")
      );
      return;
    }

    const options = await this._resolveRollOptionsFromEvent(event);
    if (!options) return;

    button.disabled = true;

    try {
      await this.actor.rollInitiative({
        token: this.token,
        modifier: options.modifier,
        mode: options.mode
      });
    } catch (err) {
      console.error("D100 Base | Attribute HUD initiative roll error", err);
      ui.notifications?.error(
        game.i18n.localize("D100BASE.Initiative.RollError")
      );
    } finally {
      button.disabled = false;
    }
  }

  async _onOpenStateTab(event) {
    event.preventDefault();

    const sheet = this.actor?.sheet;
    if (!sheet) return;

    const activateStateTab = () => {
      // 1) contrôleur d’onglets Foundry
      const tabsController = sheet._tabs?.[0];
      if (tabsController?.activate) {
        tabsController.activate("state");
        return true;
      }

      // 2) fallback DOM
      const targetNav = sheet.element?.find?.('.sheet-tabs.tabs [data-tab="state"]');
      const targetContent = sheet.element?.find?.('.tab[data-group="primary"][data-tab="state"]');
      const navItems = sheet.element?.find?.('.sheet-tabs.tabs .item');
      const contentTabs = sheet.element?.find?.('.tab[data-group="primary"]');

      if (targetNav?.length && targetContent?.length && navItems?.length && contentTabs?.length) {
        navItems.removeClass("active");
        contentTabs.removeClass("active");
        targetNav.addClass("active");
        targetContent.addClass("active");
        return true;
      }

      return false;
    };

    // Si la fiche est déjà ouverte, on active tout de suite
    if (sheet.rendered) {
      activateStateTab();
      return;
    }

    // Sinon on attend le rendu réel de la fiche
    Hooks.once(`render${sheet.constructor.name}`, () => {
      activateStateTab();
    });

    sheet.render(true);
  }
}