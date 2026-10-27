<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class PickRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'options' => ['present', 'array', 'max:50'],
            'options.*' => ['string', 'max:64'],
            'seen' => ['sometimes', 'boolean'],
        ];
    }
}
