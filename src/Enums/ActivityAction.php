<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

enum ActivityAction: string
{
    case View = 'view';
    case Pick = 'pick';
    case Comment = 'comment';
    case Pin = 'pin';
    case Edit = 'edit';
    case Decide = 'decide';
    case Push = 'push';
}
