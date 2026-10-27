<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ItemUpdateRequest extends FormRequest
{
    /** Fields only the author may change; anyone may move or resize. */
    public const array AUTHOR_ONLY = ['color', 'text', 'points', 'texts'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            ...ItemRequest::anchorRules(),
            ...ItemRequest::boxRules(required: false),
            ...ItemRequest::contentRules(),
        ];
    }

    public function changesContent(): bool
    {
        return array_intersect(self::AUTHOR_ONLY, array_keys($this->all())) !== [];
    }
}
