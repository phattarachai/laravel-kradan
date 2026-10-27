<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CommentRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'step' => ['required', 'string', 'max:512'],
            'body' => ['required_without:edit', 'nullable', 'string', 'max:5000'],
            'parent_id' => ['nullable', 'integer'],
            'pin' => ['nullable', 'array'],
            'pin.option' => ['nullable', 'string', 'max:64'],
            'pin.device' => ['nullable', 'string', 'max:32'],
            'pin.x' => ['nullable', 'numeric'],
            'pin.y' => ['nullable', 'numeric'],
            'pin.src' => ['nullable', 'string', 'max:2000'],
            'pin.text' => ['nullable', 'string', 'max:2000'],
            'pin.box' => ['nullable', 'array'],
            'pin.box.w' => ['nullable', 'numeric'],
            'pin.box.h' => ['nullable', 'numeric'],
            'pin.box.texts' => ['nullable', 'array', 'max:200'],
            'pin.box.texts.*' => ['string', 'max:2000'],
            'edit' => ['nullable', 'array'],
            'edit.from' => ['required_with:edit', 'string', 'max:2000'],
            'edit.to' => ['required_with:edit', 'string', 'max:2000'],
        ];
    }
}
