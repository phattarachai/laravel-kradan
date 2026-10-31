<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Phattarachai\Kradan\Support\ShareLinks;

final class ShareRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'days' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:3650'],
            'round' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * Days until the link expires: 14 when not given, 0 or null for never.
     */
    public function days(): ?int
    {
        if (! $this->has('days')) {
            return ShareLinks::DEFAULT_DAYS;
        }

        $days = $this->validated('days');

        return $days === null ? null : (int) $days;
    }

    public function roundNumber(): ?int
    {
        $round = $this->validated('round');

        return $round === null ? null : (int) $round;
    }
}
