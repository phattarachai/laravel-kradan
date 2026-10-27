<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Http\Controllers\ContentController;

Route::get('f/{round}/{expires}/{signature}/{path?}', ContentController::class)
    ->whereNumber(['round', 'expires'])
    ->where('signature', '[a-f0-9]+')
    ->where('path', '.*')
    ->name('content');

Route::get('assets/{file}', AssetController::class)
    ->where('file', '[a-z0-9.-]+')
    ->name('asset');
