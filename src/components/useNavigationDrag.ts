import {
	closestCenter, CollisionDetection, DragEndEvent, DragStartEvent,
	PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { NavigationDragData } from "src/models/NavigationDrag";

// Both live tabs and archive bookmarks use the same activation and targeting rules.
export const useNavigationDrag = (onDrop: (event: DragEndEvent) => void | Promise<void>) => {
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
	const [dragKind, setDragKind] = useState<NavigationDragData["kind"] | null>(null);
	const collisionDetection: CollisionDetection = (args) => {
		const kind = (args.active.data.current as NavigationDragData | undefined)?.kind;
		return closestCenter({ ...args,
			droppableContainers: args.droppableContainers.filter((container) => {
				const target = (container.data.current as NavigationDragData | undefined)?.kind;
				if (kind === "group") return target === "group" || target === "new-group";
				if (kind === "subgroup") return target === "group" || target === "subgroup" || target === "tab-slot";
				return target !== "subgroup-slot";
			}),
		});
	};
	return {
		dragKind,
		dragProps: {
			sensors, collisionDetection,
			onDragStart: (event: DragStartEvent) => {
				setDragKind((event.active.data.current as NavigationDragData | undefined)?.kind ?? null);
			},
			onDragCancel: () => setDragKind(null),
			onDragEnd: (event: DragEndEvent) => {
				setDragKind(null);
				if (event.over && event.active.id !== event.over.id) void onDrop(event);
			},
		},
	};
};
