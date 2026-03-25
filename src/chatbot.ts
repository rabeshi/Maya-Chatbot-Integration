type MessageSender = "bot" | "user";

type ChatMessage = {
  text: string;
  sender: MessageSender;
};

type Product = {
  name: string;
  price: number;
  description: string;
  image: string;
};

type CartEntry = {
  product: Product;
  quantity: number;
};

class MayaAssistant {
  private readonly toggleButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly widget: HTMLElement;
  private readonly messagesContainer: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly quickPromptButtons: HTMLButtonElement[];
  private readonly openChatButtons: HTMLButtonElement[];
  private readonly cartToggleButton: HTMLButtonElement;
  private readonly cartCloseButton: HTMLButtonElement;
  private readonly cartClearButton: HTMLButtonElement;
  private readonly cartCheckoutButton: HTMLButtonElement;
  private readonly cartDrawer: HTMLElement;
  private readonly cartItemsContainer: HTMLElement;
  private readonly cartTotal: HTMLElement;
  private readonly cartCount: HTMLElement;
  private readonly moreProductsGrid: HTMLElement;
  private readonly popup: HTMLElement;
  private readonly popupCloseButton: HTMLButtonElement;
  private readonly popupImage: HTMLImageElement;
  private readonly popupTitle: HTMLElement;
  private readonly popupCopy: HTMLElement;
  private readonly popupSlides: HTMLElement[];
  private readonly products: Map<string, Product>;
  private readonly cart: Map<string, CartEntry>;
  private addProductButtons: HTMLButtonElement[];
  private popupTimeoutId: number | null;
  private popupIntervalId: number | null;

  constructor() {
    this.toggleButton = this.getElement<HTMLButtonElement>("chat-toggle");
    this.closeButton = this.getElement<HTMLButtonElement>("chat-close");
    this.widget = this.getElement<HTMLElement>("chat-widget");
    this.messagesContainer = this.getElement<HTMLElement>("chat-messages");
    this.form = this.getElement<HTMLFormElement>("chat-form");
    this.input = this.getElement<HTMLInputElement>("chat-input");
    this.quickPromptButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-prompt]"));
    this.openChatButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-open-chat='true']"));
    this.cartToggleButton = this.getElement<HTMLButtonElement>("cart-toggle");
    this.cartCloseButton = this.getElement<HTMLButtonElement>("cart-close");
    this.cartClearButton = this.getElement<HTMLButtonElement>("cart-clear");
    this.cartCheckoutButton = this.getElement<HTMLButtonElement>("cart-checkout");
    this.cartDrawer = this.getElement<HTMLElement>("cart-drawer");
    this.cartItemsContainer = this.getElement<HTMLElement>("cart-items");
    this.cartTotal = this.getElement<HTMLElement>("cart-total");
    this.cartCount = this.getElement<HTMLElement>("cart-count");
    this.moreProductsGrid = this.getElement<HTMLElement>("more-products-grid");
    this.popup = this.getElement<HTMLElement>("product-popup");
    this.popupCloseButton = this.getElement<HTMLButtonElement>("product-popup-close");
    this.popupImage = this.getElement<HTMLImageElement>("product-popup-image");
    this.popupTitle = this.getElement<HTMLElement>("product-popup-title");
    this.popupCopy = this.getElement<HTMLElement>("product-popup-copy");
    this.popupSlides = Array.from(document.querySelectorAll<HTMLElement>("[data-popup-slide]"));
    this.products = this.collectProducts();
    this.cart = new Map<string, CartEntry>();
    this.addProductButtons = [];
    this.popupTimeoutId = null;
    this.popupIntervalId = null;

    this.attachEvents();
    this.seedMessages();
    this.renderCart();
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element with id "${id}"`);
    }

    return element as T;
  }

  private collectProducts(): Map<string, Product> {
    const productNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-product-name]"));
    const products = new Map<string, Product>();

    for (const node of productNodes) {
      const name = node.dataset.productName;
      const price = Number(node.dataset.productPrice);
      const description = node.querySelector("p")?.textContent?.trim() ?? "";
      const image = node.querySelector<HTMLImageElement>("img")?.src ?? this.defaultImageFor(name ?? "");

      if (!name || Number.isNaN(price)) {
        continue;
      }

      products.set(name.toLowerCase(), { name, price, description, image });
    }

    return products;
  }

  private attachEvents(): void {
    this.toggleButton.addEventListener("click", () => this.toggleChat());
    this.closeButton.addEventListener("click", () => this.closeChat());
    this.cartToggleButton.addEventListener("click", () => this.toggleCartDrawer());
    this.cartCloseButton.addEventListener("click", () => this.closeCartDrawer());
    this.cartClearButton.addEventListener("click", () => this.clearCart(true));
    this.cartCheckoutButton.addEventListener("click", () => this.completeCheckout(true));
    this.popupCloseButton.addEventListener("click", () => this.hideProductPopup());

    for (const button of this.quickPromptButtons) {
      button.addEventListener("click", () => {
        const prompt = button.dataset.prompt;
        if (!prompt) {
          return;
        }

        this.openChat();
        this.handleUserMessage(prompt);
      });
    }

    for (const button of this.openChatButtons) {
      button.addEventListener("click", () => this.openChat());
    }

    this.refreshAddProductButtons();

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = this.input.value.trim();
      if (!value) {
        return;
      }

      this.handleUserMessage(value);
      this.input.value = "";
    });
  }

  private refreshAddProductButtons(): void {
    this.addProductButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-add-product]"));

    for (const button of this.addProductButtons) {
      if (button.dataset.bound === "true") {
        continue;
      }

      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        const productName = button.dataset.addProduct;
        if (!productName) {
          return;
        }

        const added = this.addToCart(productName);
        this.openChat();
        this.appendMessage({ text: `Add ${productName} to my cart`, sender: "user" });
        this.appendMessage({
          text: added
            ? `${productName} has been added to your bag. You can ask Maya to show your cart or check out at any time.`
            : `I couldn't find ${productName} in the current collection.`,
          sender: "bot"
        });
      });
    }
  }

  private seedMessages(): void {
    const introMessages: ChatMessage[] = [
      {
        text: "Hi, I'm Maya. I can help you shop, answer store questions, add products to your bag, and add new items to the store.",
        sender: "bot"
      },
      {
        text: "Try: Add product Silk Evening Top for $89 with description Soft drape for dinners and image bag.",
        sender: "bot"
      }
    ];

    introMessages.forEach((message) => this.appendMessage(message));
  }

  private toggleChat(): void {
    if (this.widget.classList.contains("hidden")) {
      this.openChat();
      return;
    }

    this.closeChat();
  }

  private openChat(): void {
    this.widget.classList.remove("hidden");
    this.widget.setAttribute("aria-hidden", "false");
    this.toggleButton.setAttribute("aria-expanded", "true");
    this.input.focus();
  }

  private closeChat(): void {
    this.widget.classList.add("hidden");
    this.widget.setAttribute("aria-hidden", "true");
    this.toggleButton.setAttribute("aria-expanded", "false");
  }

  private toggleCartDrawer(): void {
    if (this.cartDrawer.classList.contains("hidden")) {
      this.openCartDrawer();
      return;
    }

    this.closeCartDrawer();
  }

  private openCartDrawer(): void {
    this.cartDrawer.classList.remove("hidden");
    this.cartDrawer.setAttribute("aria-hidden", "false");
  }

  private closeCartDrawer(): void {
    this.cartDrawer.classList.add("hidden");
    this.cartDrawer.setAttribute("aria-hidden", "true");
  }

  private handleUserMessage(text: string): void {
    this.appendMessage({ text, sender: "user" });

    window.setTimeout(() => {
      this.appendMessage({
        text: this.generateReply(text),
        sender: "bot"
      });
    }, 250);
  }

  private appendMessage(message: ChatMessage): void {
    const bubble = document.createElement("div");
    bubble.className = `message ${message.sender}`;
    bubble.textContent = message.text;
    this.messagesContainer.appendChild(bubble);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private generateReply(message: string): string {
    const normalized = message.toLowerCase();

    const createRequest = this.parseCreateProductRequest(message);
    if (createRequest) {
      return this.createStoreProduct(createRequest.name, createRequest.price, createRequest.description, createRequest.imageHint);
    }

    if (normalized.includes("show my cart") || normalized.includes("show cart") || normalized.includes("view cart")) {
      this.openCartDrawer();
      return this.describeCart();
    }

    if (normalized.includes("checkout") || normalized.includes("pay") || normalized.includes("payment")) {
      return this.completeCheckout(false);
    }

    if (normalized.includes("clear cart") || normalized.includes("empty cart")) {
      return this.clearCart(false);
    }

    const productMatch = this.findProductInMessage(normalized);
    if (productMatch && (normalized.includes("add") || normalized.includes("buy") || normalized.includes("cart") || normalized.includes("bag"))) {
      const added = this.addToCart(productMatch.name);
      if (added) {
        this.openCartDrawer();
        return `${productMatch.name} has been added to your bag. ${this.describeCart()}`;
      }

      return `I couldn't add ${productMatch.name} right now.`;
    }

    if (productMatch && (normalized.includes("tell me about") || normalized.includes("details") || normalized.includes("price") || normalized.includes("what is"))) {
      return `${productMatch.name} is ${this.formatCurrency(productMatch.price)}. ${productMatch.description}`;
    }

    if (normalized.includes("size")) {
      return "Most pieces are available in XS to XL. Dresses fit true to size, and tailoring is designed for a relaxed but refined silhouette.";
    }

    if (normalized.includes("shipping") || normalized.includes("delivery")) {
      return "Standard delivery takes 3 to 5 business days, and express shipping is available at checkout for major metro areas.";
    }

    if (normalized.includes("return") || normalized.includes("exchange")) {
      return "Returns are accepted within 14 days in original condition, and exchanges can be arranged through customer care.";
    }

    if (normalized.includes("store") || normalized.includes("about")) {
      return "Maya Ntuli is a contemporary womenswear store focused on refined tailoring, modern essentials, and versatile accessories.";
    }

    if (normalized.includes("under $200") || normalized.includes("budget") || normalized.includes("under 200")) {
      return "For under $200, I'd pair the Gallery Shoulder Bag with the Quiet Sandal, or suggest the Cloud Knit Set on its own for a complete polished look.";
    }

    if (normalized.includes("dress") || normalized.includes("event") || normalized.includes("wedding")) {
      return "For an event, I'd recommend the Moonstone Slip Dress with the Marble Mini Bag for a clean evening look.";
    }

    if (normalized.includes("work") || normalized.includes("office") || normalized.includes("tailoring")) {
      return "For work, start with the Contour Linen Blazer and Column Trouser. Maya can also add both to your bag if you'd like.";
    }

    if (normalized.includes("hello") || normalized.includes("hi") || normalized.includes("hey")) {
      return "Hello. I'm Maya. I can recommend products, explain store policies, add items to your bag, and create new products for the store.";
    }

    return "Sorry, I can only give specific recommendations about our store.";
  }

  private parseCreateProductRequest(message: string): { name: string; price: number; description: string; imageHint: string } | null {
    const match = message.match(/add\s+product\s+(.+?)\s+for\s+\$?(\d+)(?:\s+with\s+description\s+(.+?))?(?:\s+and\s+image\s+(.+?))?[.!]?$/i);

    if (!match) {
      return null;
    }

    const name = match[1]?.trim();
    const price = Number(match[2]);
    const description = match[3]?.trim() || "New seasonal piece added by Maya.";
    const imageHint = match[4]?.trim() || name;

    if (!name || Number.isNaN(price)) {
      return null;
    }

    return { name, price, description, imageHint };
  }

  private createStoreProduct(name: string, price: number, description: string, imageHint: string): string {
    const key = name.toLowerCase();
    if (this.products.has(key)) {
      return `${name} is already in the store. You can ask Maya to add it to your bag instead.`;
    }

    const product: Product = {
      name,
      price,
      description,
      image: this.defaultImageFor(imageHint)
    };

    this.products.set(key, product);
    this.moreProductsGrid.prepend(this.buildProductCard(product));
    this.refreshAddProductButtons();
    this.addToCart(product.name);
    this.openCartDrawer();
    this.showProductPopup(product);

    return `${name} has been added to the store for ${this.formatCurrency(price)} and placed in your bag. ${this.describeCart()}`;
  }

  private buildProductCard(product: Product): HTMLElement {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.productName = product.name;
    card.dataset.productPrice = `${product.price}`;
    card.innerHTML = `
      <img class="product-image" src="${product.image}" alt="${product.name}" />
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <span>${this.formatCurrency(product.price)}</span>
      <button class="product-action" type="button" data-add-product="${product.name}">Add to bag</button>
    `;
    return card;
  }

  private showProductPopup(product: Product): void {
    this.popupImage.src = product.image;
    this.popupImage.alt = product.name;
    this.popupTitle.textContent = product.name;
    this.popupCopy.textContent = `${product.name} is now live in the store and has been added to your bag for ${this.formatCurrency(product.price)}.`;
    this.popup.classList.remove("hidden");
    this.popup.setAttribute("aria-hidden", "false");
    this.activatePopupSlide(0);

    if (this.popupIntervalId !== null) {
      window.clearInterval(this.popupIntervalId);
    }

    if (this.popupTimeoutId !== null) {
      window.clearTimeout(this.popupTimeoutId);
    }

    let currentSlide = 0;
    this.popupIntervalId = window.setInterval(() => {
      currentSlide = (currentSlide + 1) % this.popupSlides.length;
      this.activatePopupSlide(currentSlide);
    }, 3000);

    this.popupTimeoutId = window.setTimeout(() => {
      this.hideProductPopup();
    }, 10000);
  }

  private activatePopupSlide(index: number): void {
    this.popupSlides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === index);
    });
  }

  private hideProductPopup(): void {
    this.popup.classList.add("hidden");
    this.popup.setAttribute("aria-hidden", "true");

    if (this.popupIntervalId !== null) {
      window.clearInterval(this.popupIntervalId);
      this.popupIntervalId = null;
    }

    if (this.popupTimeoutId !== null) {
      window.clearTimeout(this.popupTimeoutId);
      this.popupTimeoutId = null;
    }
  }

  private defaultImageFor(hint: string): string {
    const normalized = hint.toLowerCase();

    if (normalized.includes("bag")) {
      return "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=900&q=80";
    }

    if (normalized.includes("shoe") || normalized.includes("sandal")) {
      return "https://images.unsplash.com/photo-1467043198406-dc953a3defa0?auto=format&fit=crop&w=900&q=80";
    }

    if (normalized.includes("dress")) {
      return "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=80";
    }

    if (normalized.includes("blazer") || normalized.includes("coat") || normalized.includes("trench")) {
      return "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80";
    }

    if (normalized.includes("knit") || normalized.includes("cardigan")) {
      return "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80";
    }

    return "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80";
  }

  private findProductInMessage(normalizedMessage: string): Product | null {
    for (const product of this.products.values()) {
      if (normalizedMessage.includes(product.name.toLowerCase())) {
        return product;
      }
    }

    return null;
  }

  private addToCart(productName: string): boolean {
    const product = this.products.get(productName.toLowerCase());
    if (!product) {
      return false;
    }

    const existing = this.cart.get(product.name);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.set(product.name, { product, quantity: 1 });
    }

    this.renderCart();
    return true;
  }

  private clearCart(fromButton: boolean): string {
    this.cart.clear();
    this.renderCart();

    const message = "Your bag is now empty.";
    if (fromButton) {
      this.openChat();
      this.appendMessage({ text: message, sender: "bot" });
    }

    return message;
  }

  private completeCheckout(fromButton: boolean): string {
    if (this.cart.size === 0) {
      const emptyMessage = "Your bag is empty. Add a few pieces first and Maya can take you through a dummy checkout.";
      if (fromButton) {
        this.openChat();
        this.appendMessage({ text: emptyMessage, sender: "bot" });
      }
      return emptyMessage;
    }

    const total = this.calculateTotal();
    this.cart.clear();
    this.renderCart();
    this.closeCartDrawer();

    const successMessage = `Dummy payment approved. Your order total was ${this.formatCurrency(total)} and a confirmation has been prepared for hello@mayantuli.com.`;
    if (fromButton) {
      this.openChat();
      this.appendMessage({ text: successMessage, sender: "bot" });
    }

    return successMessage;
  }

  private describeCart(): string {
    if (this.cart.size === 0) {
      return "Your bag is empty right now.";
    }

    const summary = Array.from(this.cart.values())
      .map((entry) => `${entry.product.name} x${entry.quantity}`)
      .join(", ");

    return `Your bag has ${summary}. Total: ${this.formatCurrency(this.calculateTotal())}.`;
  }

  private calculateTotal(): number {
    let total = 0;

    for (const entry of this.cart.values()) {
      total += entry.product.price * entry.quantity;
    }

    return total;
  }

  private renderCart(): void {
    this.cartCount.textContent = `${Array.from(this.cart.values()).reduce((sum, entry) => sum + entry.quantity, 0)}`;
    this.cartTotal.textContent = this.formatCurrency(this.calculateTotal());

    if (this.cart.size === 0) {
      this.cartItemsContainer.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
      return;
    }

    this.cartItemsContainer.innerHTML = "";

    for (const entry of this.cart.values()) {
      const item = document.createElement("div");
      item.className = "cart-item";
      item.innerHTML = `
        <div>
          <div class="cart-item-name">${entry.product.name}</div>
          <div class="cart-item-meta">${entry.product.description}</div>
          <div class="cart-item-meta">Qty ${entry.quantity}</div>
        </div>
        <div class="cart-item-price">${this.formatCurrency(entry.product.price * entry.quantity)}</div>
      `;
      this.cartItemsContainer.appendChild(item);
    }
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }
}

new MayaAssistant();
