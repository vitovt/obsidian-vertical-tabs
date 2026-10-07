import { setIcon, setTooltip } from "obsidian";
import { MouseEvent, useEffect, useRef } from "react";
import { CssClasses, toClassName } from "src/utils/CssClasses";

interface IconButtonProps {
	icon: string;
	action: string;
	tooltip?: string;
	disabled?: boolean;
	isNavAction?: boolean;
	isActive?: boolean;
	onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export const IconButton = (props: IconButtonProps) => {
	const buttonEl = useRef<HTMLDivElement>(null);
	const buttonElClasses: CssClasses = {
		"clickable-icon": true,
		"action-button": !props.isNavAction,
		"nav-action-button": props.isNavAction,
		[`action-${props.icon}`]: true,
		"is-active": props.isActive,
		"is-disabled": props.disabled,
	};

	useEffect(() => {
		if (buttonEl && buttonEl.current) {
			setIcon(buttonEl.current, props.icon);
			if (props.tooltip) setTooltip(buttonEl.current, props.tooltip);
		}
	}, [props.icon, props.tooltip]);

	return (
		<div
			className={toClassName(buttonElClasses)}
			data-action={props.action}
			role="button"
			aria-label={props.tooltip}
			aria-disabled={props.disabled || undefined}
			tabIndex={props.onClick && !props.disabled ? 0 : -1}
			ref={buttonEl}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					event.stopPropagation();
					event.currentTarget.click();
				}
			}}
			onClick={(e) => {
				e.stopPropagation();
				if (!props.disabled && props.onClick) props.onClick(e);
			}}
		/>
	);
};
