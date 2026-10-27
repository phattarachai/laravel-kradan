<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Model;
use Override;

abstract class KradanModel extends Model
{
    #[Override]
    public function getConnectionName(): ?string
    {
        return config('kradan.connection') ?? parent::getConnectionName();
    }
}
