<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

/**
 * What the host's `Kradan::auth()` callback is asked. `edit` is reserved for editing a deck's text in place
 * (not built yet); map it to the same people as `manage`.
 */
enum Ability: string
{
    case View = 'view';
    case Manage = 'manage';
    case Edit = 'edit';
}
