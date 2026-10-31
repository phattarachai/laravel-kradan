<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

/**
 * What the host's `Kradan::auth()` callback is asked. `share` makes and revokes a deck's public links. `edit` is
 * reserved for editing a deck's text in place (not built yet). A callback that returns null for either, or whose
 * `match` has no arm for it, gives it to the people its fallback names.
 */
enum Ability: string
{
    case View = 'view';
    case Manage = 'manage';
    case Share = 'share';
    case Edit = 'edit';

    public function fallback(): ?self
    {
        return match ($this) {
            self::Share => self::View,
            self::Edit => self::Manage,
            default => null,
        };
    }
}
