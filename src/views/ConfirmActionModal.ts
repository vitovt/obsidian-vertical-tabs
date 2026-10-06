import { App, Modal, Setting } from "obsidian";

interface ConfirmationOptions {
	title: string;
	message: string;
	confirmText: string;
}

class ConfirmActionModal extends Modal {
	constructor(app: App, private options: ConfirmationOptions, private resolve: (confirmed: boolean) => void) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.options.title);
		this.contentEl.createEl("p", { text: this.options.message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) => button.setButtonText(this.options.confirmText).setClass("mod-destructive")
				.onClick(() => { this.resolve(true); this.close(); }));
	}

	onClose() {
		// Escape, the modal close button, and Cancel all leave the action untouched.
		this.resolve(false);
		this.contentEl.empty();
	}
}

export function confirmAction(app: App, options: ConfirmationOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmActionModal(app, options, resolve).open());
}
