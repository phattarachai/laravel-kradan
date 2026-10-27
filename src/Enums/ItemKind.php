<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

enum ItemKind: string
{
    case Note = 'note';
    case Text = 'text';
    case Image = 'image';
    case File = 'file';
    case Stroke = 'stroke';
    case Arrow = 'arrow';
    case Rect = 'rect';
    case Ellipse = 'ellipse';

    public function hasFile(): bool
    {
        return in_array($this, [self::Image, self::File], strict: true);
    }

    public function hasPoints(): bool
    {
        return in_array($this, [self::Stroke, self::Arrow], strict: true);
    }
}
