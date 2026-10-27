<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class HeartbeatRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'round' => ['nullable', 'integer'],
            'prints_seen' => ['nullable', 'array', 'max:500'],
            'prints_seen.*' => ['string', 'max:64'],
        ];
    }
}
